import { decodeSessionApiJsonV1, deserializeProductEventV1, parseSessionApiErrorV1, parseWorkbenchCursorV1,
  type LocalApiErrorV1, type ProductEventV1 } from "../../../packages/protocol/src/index.ts";

export class WorkbenchError extends Error {
  readonly code: string;
  constructor(code: string) { super(`Workbench ${code}.`); this.name = "WorkbenchError"; this.code = code; }
}
export const bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
function errorCode(error: LocalApiErrorV1): string {
  if (error.error.code === "unauthenticated" || error.error.code === "forbidden") return "permission";
  if (["snapshot_required", "event_gap", "cursor_expired", "slow_consumer"].includes(error.error.reason)) return "snapshot_required";
  if (error.error.reason === "dependency_down") return "daemon_unavailable";
  if (error.error.reason === "recovery_required") return "recovery_required";
  return error.error.code;
}
export async function responseJson(response: Response): Promise<unknown> {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") ?? "") || !response.body) throw new WorkbenchError("invalid_response");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true }); let text = "", size = 0;
  try {
    for (;;) {
      const part = await reader.read(); size += part.value?.byteLength ?? 0;
      if (size > 1_048_576) throw new WorkbenchError("response_too_large");
      text += decoder.decode(part.value, { stream: !part.done }); if (part.done) break;
    }
    return decodeSessionApiJsonV1(text);
  } catch (error) { if (error instanceof WorkbenchError) throw error; throw new WorkbenchError("invalid_response"); }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
export async function checkResponse(response: Response): Promise<void> {
  if (response.redirected || response.type === "opaqueredirect" || response.status < 200 || response.status >= 300 && response.status < 400) throw new WorkbenchError("invalid_response");
  if (response.ok) return;
  let error: LocalApiErrorV1;
  try { error = parseSessionApiErrorV1(await responseJson(response)); } catch { throw new WorkbenchError("invalid_response"); }
  if ((response.status === 401) !== (error.error.code === "unauthenticated") || (response.status === 403) !== (error.error.code === "forbidden")) throw new WorkbenchError("invalid_response");
  throw new WorkbenchError(errorCode(error));
}
export async function* eventFrames(response: Response): AsyncGenerator<Readonly<{ event: ProductEventV1; cursor: string }>> {
  if (!/^text\/event-stream(?:;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") ?? "") || !response.body) throw new WorkbenchError("invalid_response");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true }); let buffer = "";
  try {
    for (;;) {
      const part = await reader.read(); buffer += decoder.decode(part.value, { stream: !part.done });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (bytes(frame) > 1_048_576) throw new WorkbenchError("response_too_large");
        if (!frame || frame === ": heartbeat") continue;
        const fields = new Map<string, string>();
        for (const line of frame.split("\n")) { const match = /^(id|event|data): (.*)$/.exec(line);
          if (!match || fields.has(match[1]!)) throw new WorkbenchError("invalid_response"); fields.set(match[1]!, match[2]!); }
        if (fields.get("event") === "stream.error") {
          if (fields.size !== 2 || !fields.has("data")) throw new WorkbenchError("invalid_response");
          const error = parseSessionApiErrorV1(decodeSessionApiJsonV1(fields.get("data")!));
          throw new WorkbenchError(errorCode(error));
        }
        if (fields.size !== 3) throw new WorkbenchError("invalid_response");
        const event = deserializeProductEventV1(fields.get("data")!);
        if (fields.get("event") !== event.type) throw new WorkbenchError("invalid_response");
        yield { event, cursor: parseWorkbenchCursorV1(fields.get("id")) };
      }
      if (bytes(buffer) > 1_048_576) throw new WorkbenchError("response_too_large");
      if (part.done) throw new WorkbenchError(buffer ? "invalid_response" : "stream_disconnected");
    }
  } catch (error) { if (error instanceof WorkbenchError) throw error; throw new WorkbenchError("invalid_response"); }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
