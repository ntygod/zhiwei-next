import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isDiagnosticToken, type DiagnosticErrorCode } from "../../../packages/protocol/src/index.ts";

export interface DaemonConfigInput {
  readonly host?: unknown;
  readonly port?: unknown;
  readonly token?: unknown;
}

export interface DaemonConfig {
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly token: string;
}

export class DaemonDiagnosticError extends Error {
  readonly code: "invalid_configuration" | "daemon_unavailable" | "invalid_request";
  constructor(code: DaemonDiagnosticError["code"]) {
    super(code);
    this.name = "DaemonDiagnosticError";
    this.code = code;
  }
}

export function readDaemonConfig(input: DaemonConfigInput): DaemonConfig | undefined {
  if (!input || typeof input !== "object") return undefined;
  const host = input.host === undefined ? "127.0.0.1" : input.host;
  const port = input.port === undefined ? "4265" : input.port;
  const text = typeof port === "number" ? String(port) : port;
  if (host !== "127.0.0.1" || typeof text !== "string" || !/^[1-9][0-9]{0,4}$/.test(text)
    || Number(text) > 65535 || !isDiagnosticToken(input.token)) return undefined;
  return { host, port: Number(text), token: input.token };
}

export function checkDiagnosticRequest(
  request: IncomingMessage,
  config: DaemonConfig,
): { readonly status: number; readonly code: DiagnosticErrorCode } | undefined {
  const headers = request.headersDistinct;
  if (request.socket.localAddress !== config.host || request.socket.remoteAddress !== config.host
    || headers.host?.length !== 1 || headers.host[0] !== `${config.host}:${config.port}`
    || headers.origin !== undefined) return { status: 403, code: "forbidden" };

  const authorization = headers.authorization;
  const expected = Buffer.from(`Bearer ${config.token}`, "ascii");
  const supplied = Buffer.from(authorization?.[0] ?? "", "utf8");
  if (authorization?.length !== 1 || supplied.length !== expected.length
    || !timingSafeEqual(supplied, expected)) return { status: 401, code: "unauthorized" };
  if (request.headers["content-length"] !== undefined || request.headers["transfer-encoding"] !== undefined
    || headers.expect !== undefined) {
    return { status: 400, code: "invalid_request" };
  }
  if (request.method !== "GET") return { status: 405, code: "method_not_allowed" };
  if (request.url !== "/health" && request.url !== "/v1/meta") return { status: 404, code: "not_found" };
  return undefined;
}
