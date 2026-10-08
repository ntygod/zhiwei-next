import { request } from "node:http";
import { isDiagnosticToken, parseDiagnosticHealthV1, type DiagnosticResult } from "../../../packages/protocol/src/index.ts";

export interface DoctorConfigInput {
  readonly baseUrl?: unknown;
  readonly token?: unknown;
  readonly timeoutMs?: unknown;
}

interface DoctorConfig {
  readonly port: number;
  readonly token: string;
  readonly timeoutMs: number;
}

function readDoctorConfig(input: DoctorConfigInput): DoctorConfig | undefined {
  if (!input || typeof input !== "object") return undefined;
  const baseUrl = input.baseUrl === undefined ? "http://127.0.0.1:4265" : input.baseUrl;
  // Match BEFORE URL normalization: integer/hex/short IPv4, credentials and suffixes are refused.
  const match = typeof baseUrl === "string" ? /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/?$/.exec(baseUrl) : null;
  const timeoutMs = input.timeoutMs === undefined ? 2000 : input.timeoutMs;
  if (!match || Number(match[1]) > 65535 || !isDiagnosticToken(input.token)
    || typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) return undefined;
  return { port: Number(match[1]), token: input.token, timeoutMs };
}

export function checkDaemonHealth(input: DoctorConfigInput): Promise<DiagnosticResult> {
  const config = readDoctorConfig(input);
  if (!config) return Promise.resolve({ ok: false, code: "invalid_configuration" });
  return new Promise(resolve => {
    let finished = false;
    const chunks: Buffer[] = [];
    let bytes = 0;
    const finish = (result: DiagnosticResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // Stop body consumption and close the socket on every result, including failure.
      outgoing.destroy();
      chunks.length = 0;
      resolve(result);
    };
    // Direct numeric loopback HTTP: no DNS, proxy discovery, cookies, redirect or decompression.
    const outgoing = request({
      hostname: "127.0.0.1", family: 4, port: config.port, path: "/health", method: "GET", agent: false,
      maxHeaderSize: 8192,
      headers: { host: `127.0.0.1:${config.port}`, authorization: `Bearer ${config.token}`, accept: "application/json", connection: "close" },
    }, response => {
      const status = response.statusCode ?? 0;
      // Check the complete name/value-pair count before trusting status or any field.
      if (response.rawHeaders.length > 64 * 2) {
        finish({ ok: false, code: "invalid_response" });
      } else if (status === 401 || status === 403) {
        finish({ ok: false, code: status === 401 ? "unauthorized" : "forbidden" });
      } else if (status >= 300 && status < 400) {
        finish({ ok: false, code: "redirect_refused" });
      } else if (status !== 200) {
        finish({ ok: false, code: "unexpected_status" });
      } else if (response.headersDistinct["content-type"]?.length !== 1
        || !/^application\/json(?:; charset=utf-8)?$/i.test(response.headers["content-type"] ?? "")
        || response.headers["content-encoding"] !== undefined) {
        finish({ ok: false, code: "invalid_response" });
      } else {
        response.on("data", (chunk: Buffer) => {
          if (finished) return;
          bytes += chunk.length;
          if (bytes > 4096) finish({ ok: false, code: "response_too_large" });
          else chunks.push(chunk);
        });
        response.on("end", () => {
          if (finished) return;
          try {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
            const health = parseDiagnosticHealthV1(JSON.parse(text));
            finish(health ? { ok: true, health } : { ok: false, code: "invalid_response" });
          } catch { finish({ ok: false, code: "invalid_response" }); }
        });
      }
      response.on("error", () => finish({ ok: false, code: "invalid_response" }));
    });
    // Keep all headers within maxHeaderSize; reject count overflow instead of truncating.
    outgoing.maxHeadersCount = 0;
    outgoing.on("error", (error: NodeJS.ErrnoException) => {
      const code = error.code === "HPE_HEADER_OVERFLOW" ? "response_too_large"
        : error.code?.startsWith("HPE_") ? "invalid_response" : "daemon_unavailable";
      finish({ ok: false, code });
    });
    const timer = setTimeout(() => finish({ ok: false, code: "timeout" }), config.timeoutMs);
    outgoing.end();
  });
}
