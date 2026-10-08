/** Finite bootstrap diagnostics, independent of the durable Runtime event protocol. */
export interface DiagnosticHealthV1 {
  readonly status: "ok";
  readonly service: "zhiwei-daemon";
  readonly version: "0.0.0";
  readonly milestone: "M0-bootstrap";
}

export interface DiagnosticMetaV1 {
  readonly product: "ZhiWei Next";
  readonly protocolVersion: 1;
  readonly capabilities: readonly ["health", "normalized-runtime-events"];
}

export type DiagnosticErrorCode =
  | "invalid_configuration" | "unauthorized" | "forbidden"
  | "invalid_request" | "not_found" | "method_not_allowed"
  | "daemon_unavailable" | "timeout" | "redirect_refused"
  | "unexpected_status" | "invalid_response" | "response_too_large";

export interface DiagnosticErrorV1 {
  readonly protocolVersion: 1;
  readonly error: { readonly code: DiagnosticErrorCode };
}

export type DiagnosticResult =
  | { readonly ok: true; readonly health: DiagnosticHealthV1 }
  | { readonly ok: false; readonly code: DiagnosticErrorCode };

/** Wire syntax only; possession does not authorize any future data/tool operation. */
export function isDiagnosticToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

export function parseDiagnosticHealthV1(value: unknown): DiagnosticHealthV1 | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "milestone,service,status,version"
    || record.status !== "ok" || record.service !== "zhiwei-daemon"
    || record.version !== "0.0.0" || record.milestone !== "M0-bootstrap") return undefined;
  // Reconstruct the allowlisted result; never pass through response objects.
  return { status: "ok", service: "zhiwei-daemon", version: "0.0.0", milestone: "M0-bootstrap" };
}
