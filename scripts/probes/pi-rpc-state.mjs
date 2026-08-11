import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

const baselineUrl = new URL("../../packages/pi-adapter/fixtures/pi-upstream-baseline.json", import.meta.url);
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"));

function versionTuple(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) throw new Error(`Unable to parse Node.js version: ${value}`);
  return match.slice(1).map(Number);
}

function atLeast(current, minimum) {
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

if (!atLeast(versionTuple(process.versions.node), [22, 19, 0])) {
  throw new Error(
    `Pi ${baseline.package.version} requires Node ${baseline.package.nodeEngine}; current runtime is ${process.versions.node}.`,
  );
}

const defaultExecutable = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "pi.cmd" : "pi",
);
const executable = resolve(process.env.PI_EXECUTABLE ?? defaultExecutable);
if (!existsSync(executable)) {
  throw new Error(
    `Pi executable not found at the configured isolated path. Install ${baseline.package.name}@${baseline.package.version} first.`,
  );
}

let prefixArgs = [];
if (process.env.PI_EXECUTABLE_ARGS_JSON) {
  const parsed = JSON.parse(process.env.PI_EXECUTABLE_ARGS_JSON);
  if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
    throw new Error("PI_EXECUTABLE_ARGS_JSON must be a JSON array of strings.");
  }
  prefixArgs = parsed.map((value) => resolve(value));
  for (const value of prefixArgs) {
    if (!existsSync(value)) throw new Error("A configured Pi executable argument does not exist.");
  }
}

const probeCwd = resolve(process.env.PI_PROBE_CWD ?? process.cwd());
const child = spawn(executable, [...prefixArgs, "--mode", "rpc", "--no-session"], {
  cwd: probeCwd,
  env: { ...process.env, AI_AGENT: "zhiwei-pi-rpc-probe" },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderr = "";
const responses = new Map();

function stopChild() {
  if (!child.killed) child.kill();
}

const completion = new Promise((resolvePromise, reject) => {
  const timer = setTimeout(() => {
    stopChild();
    reject(
      new Error(
        `Timed out waiting for Pi RPC state responses. stderr=${stderr.slice(0, 1000) || "<empty>"}`,
      ),
    );
  }, 15000);

  function maybeResolve() {
    if (!responses.has("state-1") || !responses.has("messages-1")) return;
    clearTimeout(timer);
    resolvePromise();
  }

  child.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });

  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4000);
  });

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      let line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.length === 0) continue;

      let record;
      try {
        record = JSON.parse(line);
      } catch {
        clearTimeout(timer);
        reject(new Error(`Pi RPC emitted invalid JSONL: ${line.slice(0, 300)}`));
        return;
      }
      if (record.type === "response" && typeof record.id === "string") {
        responses.set(record.id, record);
        maybeResolve();
      }
    }
  });
});

child.stdin.write(`${JSON.stringify({ id: "state-1", type: "get_state" })}\n`);
child.stdin.write(`${JSON.stringify({ id: "messages-1", type: "get_messages" })}\n`);

await completion;
stopChild();

const state = responses.get("state-1");
const messages = responses.get("messages-1");

if (!state?.success || state.command !== "get_state") {
  throw new Error(`get_state failed: ${JSON.stringify(state)}`);
}
if (typeof state.data?.sessionId !== "string" || state.data.sessionId.length === 0) {
  throw new Error("get_state response does not contain a non-empty sessionId.");
}
if (typeof state.data?.isStreaming !== "boolean") {
  throw new Error("get_state response does not contain boolean isStreaming.");
}
if (!messages?.success || messages.command !== "get_messages" || !Array.isArray(messages.data?.messages)) {
  throw new Error(`get_messages failed: ${JSON.stringify(messages)}`);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      package: `${baseline.package.name}@${baseline.package.version}`,
      node: process.versions.node,
      executionMode: prefixArgs.length > 0 ? "node-cli-entry" : "package-bin",
      sessionIdPresent: true,
      isStreaming: state.data.isStreaming,
      messageCount: messages.data.messages.length,
      credentialsUsed: false,
      promptsSent: 0,
      stderrPresent: stderr.length > 0,
    },
    null,
    2,
  ),
);
