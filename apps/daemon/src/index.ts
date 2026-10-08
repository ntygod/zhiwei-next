import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import type { DiagnosticErrorV1, DiagnosticHealthV1, DiagnosticMetaV1 } from "../../../packages/protocol/src/index.ts";
import { checkDiagnosticRequest, readDaemonConfig, DaemonDiagnosticError, type DaemonConfigInput } from "./local-api-security.ts";

export { DaemonDiagnosticError } from "./local-api-security.ts";
export type { DaemonConfigInput } from "./local-api-security.ts";

export const bootstrapVersion = "0.0.0";

function writeJson(response: ServerResponse, status: number, body: DiagnosticHealthV1 | DiagnosticMetaV1 | DiagnosticErrorV1): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "connection": "close",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

export interface LocalDaemon {
  /** Binds only the validated address. No raw Server/listen options escape this boundary. */
  listen(): Promise<void>;
  close(): Promise<void>;
}

export function createDaemonServer(input: DaemonConfigInput = {}): LocalDaemon {
  const config = readDaemonConfig(input);
  if (!config) throw new DaemonDiagnosticError("invalid_configuration");
  const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
    const rejection = checkDiagnosticRequest(request, config);
    if (rejection) {
      writeJson(response, rejection.status, { protocolVersion: 1, error: { code: rejection.code } });
    } else if (request.url === "/health") {
      writeJson(response, 200, { status: "ok", service: "zhiwei-daemon", version: bootstrapVersion, milestone: "M0-bootstrap" });
    } else {
      writeJson(response, 200, { product: "ZhiWei Next", protocolVersion: 1, capabilities: ["health", "normalized-runtime-events"] });
    }
  };
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 5000 }, handleRequest);
  // Zero disables Node's silent header-count truncation, not the byte parser cap.
  // The request boundary rejects more than 64 complete fields before authorization.
  server.maxHeadersCount = 0;
  // Otherwise Node answers Expect before the authenticated request boundary runs.
  server.on("checkContinue", handleRequest);
  server.on("checkExpectation", handleRequest);
  server.maxRequestsPerSocket = 1;
  // Do not let Node generate an unauthenticated default 503 for pipelined excess requests.
  server.on("dropRequest", (_request, socket) => socket.destroy());
  server.setTimeout(2000, socket => socket.destroy());
  // HTTP parser errors can contain raw request bytes. Never serialize/log the error.
  server.on("clientError", (_error, socket) => {
    if (!socket.destroyed && socket.writable && !socket.writableEnded) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n", () => socket.destroy());
    } else socket.destroy();
  });
  for (const event of ["upgrade", "connect"] as const) {
    server.on(event, (_request, socket) => {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n", () => socket.destroy());
    });
  }
  let state: "idle" | "starting" | "listening" | "closed" = "idle";
  let closing: Promise<void> | undefined;
  return {
    listen: () => new Promise((resolve, reject) => {
      if (state !== "idle") { reject(new DaemonDiagnosticError("invalid_request")); return; }
      state = "starting";
      const failed = () => { state = "closed"; reject(new DaemonDiagnosticError("daemon_unavailable")); };
      server.once("error", failed);
      server.listen(config.port, config.host, () => {
        server.removeListener("error", failed);
        state = "listening";
        resolve();
      });
    }),
    close: () => {
      if (closing) return closing;
      if (state === "starting") return Promise.reject(new DaemonDiagnosticError("invalid_request"));
      if (state !== "listening") { state = "closed"; return Promise.resolve(); }
      state = "closed";
      closing = new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close(error => error ? reject(new DaemonDiagnosticError("daemon_unavailable")) : resolve());
      });
      return closing;
    },
  };
}

/** Environment is read only by the executable entrypoint, never hidden in reusable APIs. */
export async function startDaemon(input: DaemonConfigInput = {}): Promise<LocalDaemon> {
  const daemon = createDaemonServer(input);
  await daemon.listen();
  return daemon;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = { host: process.env.ZHIWEI_HOST, port: process.env.ZHIWEI_PORT, token: process.env.ZHIWEI_DIAGNOSTIC_TOKEN };
  if (!readDaemonConfig(input)) {
    console.error("Daemon error: invalid_configuration. Configure a loopback address, valid port and diagnostic token.");
    process.exitCode = 1;
  } else {
    try {
      const daemon = await startDaemon(input);
      console.log("zhiwei-daemon: protected local diagnostics listening");
      const shutdown = () => {
        process.removeListener("SIGINT", shutdown);
        process.removeListener("SIGTERM", shutdown);
        void daemon.close().catch(() => { console.error("Daemon error: daemon_unavailable."); process.exitCode = 1; });
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    } catch {
      console.error("Daemon error: daemon_unavailable. Check whether the configured local port is available.");
      process.exitCode = 1;
    }
  }
}
