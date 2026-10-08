import { pathToFileURL } from "node:url";
import type { DiagnosticErrorCode } from "../../../packages/protocol/src/index.ts";
import { checkDaemonHealth, type DoctorConfigInput } from "./doctor.ts";

const help = `知微 CLI（Bootstrap）

用法：
  zhiwei version
  zhiwei doctor
  zhiwei help

环境变量：
  ZHIWEI_DAEMON_URL        默认 http://127.0.0.1:4265，仅支持此 IPv4 loopback 地址与有效端口
  ZHIWEI_DIAGNOSTIC_TOKEN 必填，与 Daemon 一致的 64 位十六进制诊断凭据
`;

const guidance: Record<DiagnosticErrorCode, string> = {
  invalid_configuration: "Check the local URL, port and diagnostic token configuration.",
  unauthorized: "Check that the client and daemon diagnostic tokens match.",
  forbidden: "The daemon refused the request source or authority.",
  invalid_request: "The daemon refused the diagnostic request.",
  not_found: "The diagnostic endpoint is not available.",
  method_not_allowed: "The diagnostic method is not supported.",
  daemon_unavailable: "Check that the local daemon is running.",
  timeout: "The local diagnostic request exceeded its time limit.",
  redirect_refused: "The diagnostic endpoint must not redirect.",
  unexpected_status: "The daemon returned an unsupported status.",
  invalid_response: "The daemon returned an invalid diagnostic response.",
  response_too_large: "The daemon exceeded the diagnostic response size limit.",
};

export async function runCli(
  args: readonly string[],
  output: (line: string) => void = console.log,
  config: DoctorConfigInput = {},
): Promise<number> {
  const command = args[0] ?? "help";
  if (args.length > 1) { output("Invalid command arguments. Use zhiwei help."); return 2; }
  if (command === "help" || command === "--help" || command === "-h") { output(help.trimEnd()); return 0; }
  if (command === "version" || command === "--version" || command === "-v") { output("zhiwei-next 0.0.0"); return 0; }
  if (command === "doctor") {
    const result = await checkDaemonHealth(config);
    if (!result.ok) { output(`Daemon error: ${result.code}. ${guidance[result.code]}`); return 1; }
    output(`Daemon OK: ${JSON.stringify(result.health)}`);
    return 0;
  }
  output("Unknown command. Use zhiwei help.");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2), console.log, {
    baseUrl: process.env.ZHIWEI_DAEMON_URL, token: process.env.ZHIWEI_DIAGNOSTIC_TOKEN,
  });
}
