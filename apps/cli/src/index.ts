import { pathToFileURL } from "node:url";

const help = `知微 CLI（Bootstrap）

用法：
  zhiwei version
  zhiwei doctor
  zhiwei help

环境变量：
  ZHIWEI_DAEMON_URL  默认 http://127.0.0.1:4265
`;

export async function runCli(
  args: readonly string[],
  output: (line: string) => void = console.log,
): Promise<number> {
  const command = args[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    output(help.trimEnd());
    return 0;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    output("zhiwei-next 0.0.0");
    return 0;
  }

  if (command === "doctor") {
    const baseUrl = process.env.ZHIWEI_DAEMON_URL ?? "http://127.0.0.1:4265";
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        output(`Daemon unhealthy: HTTP ${response.status}`);
        return 1;
      }
      const health = await response.json();
      output(`Daemon OK: ${JSON.stringify(health)}`);
      return 0;
    } catch (error) {
      output(`Daemon unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  output(`Unknown command: ${command}\n\n${help}`);
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
