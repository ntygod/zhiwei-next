import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

export const bootstrapVersion = "0.0.0";

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export function createDaemonServer() {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, {
        status: "ok",
        service: "zhiwei-daemon",
        version: bootstrapVersion,
        milestone: "M0-bootstrap",
      });
      return;
    }

    if (request.method === "GET" && request.url === "/v1/meta") {
      writeJson(response, 200, {
        product: "ZhiWei Next",
        protocolVersion: 1,
        capabilities: ["health", "normalized-runtime-events"],
      });
      return;
    }

    writeJson(response, 404, {
      error: "not_found",
      message: "The requested bootstrap endpoint does not exist.",
    });
  });
}

export function startDaemon(): void {
  const port = Number.parseInt(process.env.ZHIWEI_PORT ?? "4265", 10);
  const host = process.env.ZHIWEI_HOST ?? "127.0.0.1";
  const server = createDaemonServer();

  server.listen(port, host, () => {
    console.log(`zhiwei-daemon listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDaemon();
}
