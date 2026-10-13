import { pathToFileURL } from "node:url";
import { readDaemonConfig } from "./local-api-security.ts";

// Reject invalid executable configuration before loading the synthetic service
// exports in index.ts. Reusable APIs still require explicit caller configuration.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = { host: process.env.ZHIWEI_HOST, port: process.env.ZHIWEI_PORT, token: process.env.ZHIWEI_DIAGNOSTIC_TOKEN };
  if (!readDaemonConfig(input)) {
    console.error("Daemon error: invalid_configuration. Configure a loopback address, valid port and diagnostic token.");
    process.exitCode = 1;
  } else {
    try {
      const { startDaemon } = await import("./index.ts");
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
