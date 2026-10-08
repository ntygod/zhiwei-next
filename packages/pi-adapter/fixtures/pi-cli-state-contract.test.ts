import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { inspect } from "node:util";
import { fileURLToPath } from "node:url";

import { PiCliContractError, runPiCliStateProbe } from "./pi-cli-state-contract.ts";

const syntheticSecret = "SYNTHETIC_ONLY_DO_NOT_REFLECT_7d90a";
const packageManifest = {
  name: "@earendil-works/pi-coding-agent",
  version: "0.84.1",
  type: "module",
  bin: { pi: "dist/cli.js" },
};
const successfulState = {
  type: "response",
  id: "state-1",
  command: "get_state",
  success: true,
  data: { sessionId: "SYNTHETIC_ONLY", isStreaming: false },
};
const successfulMessages = {
  type: "response",
  id: "messages-1",
  command: "get_messages",
  success: true,
  data: { messages: [] },
};
const expectedRequests = [
  { id: "state-1", type: "get_state" },
  { id: "messages-1", type: "get_messages" },
];
const successfulBody = `
await requestsReady;
send(state);
send(messages);
await inputEnded;
assert.deepEqual(requests, expectedRequests);
`;

type Options = {
  packageDirectory: string;
  nodeExecutable: string;
  workspaceDirectory: string;
  stateDirectory: string;
  hostEnvironment: Record<string, unknown>;
  deadlineMs?: number;
};

type Fixture = {
  root: string;
  packageDirectory: string;
  entry: string;
  pidFile: string;
  observationFile: string;
  readOnlyDirectories: string[];
  options: Options;
};

async function fixture(t: TestContext, body = successfulBody): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "zhiwei-cli-contract-"));
  const packageDirectory = join(root, "package");
  const workspaceDirectory = join(root, "workspace");
  const stateDirectory = join(root, "state");
  const entry = join(packageDirectory, "dist", "cli.js");
  const pidFile = join(root, "synthetic-child.pid");
  const observationFile = join(root, "synthetic-observation.json");
  const readOnlyDirectories: string[] = [];
  t.after(async () => {
    // Failed implementations must not leave a synthetic child behind. Assertions
    // below check the PID before this last-resort test cleanup can hide a leak.
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, "utf8"));
      try { process.kill(pid, "SIGKILL"); } catch (error) {
        if (!isMissingProcess(error)) throw error;
      }
    }
    for (const directory of readOnlyDirectories) await chmod(directory, 0o700);
    await rm(root, { recursive: true, force: true });
  });
  await Promise.all([
    mkdir(dirname(entry), { recursive: true }),
    mkdir(workspaceDirectory),
    mkdir(stateDirectory),
  ]);
  await writeFile(join(packageDirectory, "package.json"), JSON.stringify(packageManifest));
  await writeFile(entry, `
import assert from "node:assert/strict";
import { writeFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
const pidFile = ${JSON.stringify(pidFile)};
const observationFile = ${JSON.stringify(observationFile)};
const workspaceDirectory = ${JSON.stringify(workspaceDirectory)};
const stateDirectory = ${JSON.stringify(stateDirectory)};
const syntheticSecret = ${JSON.stringify(syntheticSecret)};
const state = ${JSON.stringify(successfulState)};
const messages = ${JSON.stringify(successfulMessages)};
const expectedRequests = ${JSON.stringify(expectedRequests)};
writeFileSync(pidFile, String(process.pid));
const requests = [];
let pending = "";
let resolveRequests;
let resolveEnd;
const requestsReady = new Promise((resolve) => { resolveRequests = resolve; });
const inputEnded = new Promise((resolve) => { resolveEnd = resolve; });
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  while (pending.includes("\\n")) {
    const end = pending.indexOf("\\n");
    requests.push(JSON.parse(pending.slice(0, end)));
    pending = pending.slice(end + 1);
  }
  if (requests.length >= 2) resolveRequests();
});
process.stdin.on("end", () => {
  assert.equal(pending, "");
  resolveEnd();
});
function send(value) { process.stdout.write(JSON.stringify(value) + "\\n"); }
${body}
`);
  return {
    root, packageDirectory, entry, pidFile, observationFile, readOnlyDirectories,
    options: {
      packageDirectory,
      nodeExecutable: process.execPath,
      workspaceDirectory,
      stateDirectory,
      hostEnvironment: {},
    },
  };
}

function isMissingProcess(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ESRCH";
}

function assertChildGone(value: Fixture): void {
  assert.ok(existsSync(value.pidFile), "the real synthetic child must have started");
  const pid = Number(readFileSync(value.pidFile, "utf8"));
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.throws(() => process.kill(pid, 0), isMissingProcess, "probe returned with a live child");
}

async function assertOwnStateClean(value: Fixture): Promise<void> {
  assert.deepEqual(await readdir(value.options.stateDirectory), [], "remove only probe-owned state before returning");
}

function assertSanitized(error: unknown, code: string): boolean {
  assert.ok(error instanceof PiCliContractError);
  assert.equal(error.code, code);
  assert.equal(error.message, `Pi CLI state probe failed: ${code}.`);
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.equal(inspect(error, { depth: 10 }).includes(syntheticSecret), false);
  assert.equal(JSON.stringify(error).includes(syntheticSecret), false);
  return true;
}

async function rejectBeforeLaunch(value: Fixture, input: unknown, code: string): Promise<void> {
  await assert.rejects(runPiCliStateProbe(input), (error) => assertSanitized(error, code));
  assert.equal(existsSync(value.pidFile), false, "invalid input must not start a child");
}

async function rejectChild(t: TestContext, body: string, code: string, deadlineMs?: number): Promise<Fixture> {
  const value = await fixture(t, body);
  if (deadlineMs !== undefined) value.options.deadlineMs = deadlineMs;
  await assert.rejects(runPiCliStateProbe(value.options), (error) => assertSanitized(error, code));
  assertChildGone(value);
  await assertOwnStateClean(value);
  return value;
}

test("Pi CLI probe uses the exact CLI flags, isolated directories, and two zero-prompt requests", async (t) => {
  const value = await fixture(t, `
const argv = process.argv.slice(2);
const sessionDirectory = argv.at(-1);
assert.deepEqual(argv.slice(0, -1), [
  "--mode", "rpc", "--no-session", "--no-tools", "--no-extensions",
  "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
  "--offline", "--thinking", "off", "--session-dir",
]);
assert.equal(process.cwd(), realpathSync(workspaceDirectory));
for (const directory of [process.env.HOME, process.env.PI_CODING_AGENT_DIR, process.env.TMPDIR, sessionDirectory]) {
  assert.equal(typeof directory, "string");
  assert.equal(isAbsolute(directory), true);
  const pathWithinState = relative(stateDirectory, directory);
  assert.ok(pathWithinState && !pathWithinState.startsWith(".." + sep) && !isAbsolute(pathWithinState));
  assert.equal(realpathSync(directory), directory);
  assert.equal(statSync(directory).isDirectory(), true);
}
for (const key of ["PATH", "npm_config_userconfig", "SYNTHETIC_IGNORED", "PI_PACKAGE_DIR", "PI_PROBE_CWD", "PI_PROBE_STATE_DIR"]) {
  assert.equal(Object.hasOwn(process.env, key), false);
}
assert.equal(Object.values(process.env).includes(syntheticSecret), false);
writeFileSync(observationFile, JSON.stringify({ argv, environmentKeys: Object.keys(process.env) }));
${successfulBody}
`);
  value.options.hostEnvironment = {
    HOME: syntheticSecret,
    PATH: syntheticSecret,
    npm_config_userconfig: syntheticSecret,
    SYNTHETIC_IGNORED: syntheticSecret,
    PI_PACKAGE_DIR: syntheticSecret,
    PI_PROBE_CWD: syntheticSecret,
    PI_PROBE_STATE_DIR: syntheticSecret,
  };
  assert.deepEqual(await runPiCliStateProbe(value.options), {
    status: "ok",
    package: "@earendil-works/pi-coding-agent@0.84.1",
    node: "22.23.1",
    executionMode: "node-cli-entry",
    sessionIdPresent: true,
    isStreaming: false,
    messageCount: 0,
    credentialsUsed: false,
    promptsSent: 0,
    stderrPresent: false,
  });
  assert.ok(existsSync(value.observationFile));
  assertChildGone(value);
  await assertOwnStateClean(value);
});

test("Pi CLI probe accepts a package directory and Node executable reached through explicit symlinks", async (t) => {
  const value = await fixture(t);
  const packageLink = join(value.root, "package-link");
  const nodeLink = join(value.root, "node-link");
  await symlink(value.packageDirectory, packageLink, "dir");
  await symlink(process.execPath, nodeLink, "file");
  assert.equal((await runPiCliStateProbe({ ...value.options, packageDirectory: packageLink, nodeExecutable: nodeLink })).status, "ok");
  assertChildGone(value);
  await assertOwnStateClean(value);
});

test("Pi CLI probe returns only a closed nonsecret summary and a stderr-presence bit", async (t) => {
  const value = await fixture(t, `
await requestsReady;
state.data.sessionId = syntheticSecret;
state.data.sessionName = syntheticSecret;
process.stderr.write(syntheticSecret);
send(messages);
send(state);
await inputEnded;
`);
  const result = await runPiCliStateProbe(value.options);
  assert.equal(result.stderrPresent, true);
  assert.deepEqual(Object.keys(result).sort(), [
    "credentialsUsed", "executionMode", "isStreaming", "messageCount", "node", "package",
    "promptsSent", "sessionIdPresent", "status", "stderrPresent",
  ]);
  assert.equal(JSON.stringify(result).includes(syntheticSecret), false);
  assertChildGone(value);
  await assertOwnStateClean(value);
});

for (const [name, input] of [
  ["undefined", undefined], ["null", null], ["array", []], ["string", syntheticSecret],
  ["number", 1], ["boolean", true], ["date", new Date(0)],
] as const) {
  test(`Pi CLI probe rejects ${name} options before launch`, async (t) => {
    const value = await fixture(t);
    await rejectBeforeLaunch(value, input, "configuration");
  });
}

for (const field of ["packageDirectory", "nodeExecutable", "workspaceDirectory", "stateDirectory", "hostEnvironment"] as const) {
  test(`Pi CLI probe requires explicit ${field}`, async (t) => {
    const value = await fixture(t);
    const input: Partial<Options> = { ...value.options };
    delete input[field];
    await rejectBeforeLaunch(value, input, "configuration");
  });
}

for (const field of ["packageDirectory", "nodeExecutable", "workspaceDirectory", "stateDirectory"] as const) {
  test(`Pi CLI probe rejects relative, empty, and nonstring ${field}`, async (t) => {
    const value = await fixture(t);
    for (const invalid of ["relative/path", "", `${value.root}\0${syntheticSecret}`, 7, null]) {
      await rejectBeforeLaunch(value, { ...value.options, [field]: invalid }, "configuration");
    }
  });
}

test("Pi CLI probe rejects unknown, symbolic, inherited, and accessor option fields without evaluating them", async (t) => {
  const value = await fixture(t);
  for (const unknownField of ["executable", "prefixArgs", "prompt", "env", "__proto__"]) {
    await rejectBeforeLaunch(value, { ...value.options, [unknownField]: syntheticSecret }, "configuration");
  }
  await rejectBeforeLaunch(value, { ...value.options, [Symbol("unknown")]: true }, "configuration");
  await rejectBeforeLaunch(value, Object.create(value.options), "configuration");
  let reads = 0;
  const accessorInput = { ...value.options };
  Object.defineProperty(accessorInput, "packageDirectory", { get() { reads += 1; throw new Error(syntheticSecret); } });
  await rejectBeforeLaunch(value, accessorInput, "configuration");
  assert.equal(reads, 0);
});

test("Pi CLI probe rejects invalid deadline values before I/O", async (t) => {
  const value = await fixture(t);
  for (const deadlineMs of [0, -1, 49, 15001, 50.5, Number.NaN, Infinity, "500", null]) {
    await rejectBeforeLaunch(value, { ...value.options, deadlineMs }, "configuration");
  }
});

test("Pi CLI probe sanitizes exceptions raised while inspecting unknown options", async (t) => {
  const value = await fixture(t);
  const input = new Proxy({}, { ownKeys() { throw new Error(syntheticSecret); } });
  await rejectBeforeLaunch(value, input, "configuration");
});

test("Pi CLI probe rejects an alternate executable instead of executing it", async (t) => {
  const value = await fixture(t);
  for (const nodeExecutable of [value.entry, join(value.root, syntheticSecret)]) {
    await rejectBeforeLaunch(value, { ...value.options, nodeExecutable }, "node-runtime");
  }
});

for (const key of [
  "NODE_OPTIONS", "NODE_PATH", "OPENAI_API_KEY", "SYNTHETIC_KEYS", "SYNTHETIC_TOKEN",
  "SYNTHETIC_SECRET", "SYNTHETIC_PASSWORD", "PI_CODING_AGENT_DIR", "PI_EXECUTABLE",
  "PI_EXECUTABLE_ARGS_JSON", "HTTP_PROXY", "https_proxy", "All_PrOxY", "no_proxy",
]) {
  test(`Pi CLI probe rejects forbidden host environment selector ${key}`, async (t) => {
    const value = await fixture(t);
    await rejectBeforeLaunch(value, { ...value.options, hostEnvironment: { [key]: syntheticSecret } }, "environment");
  });
}

test("Pi CLI probe rejects malformed environment values and accessors without reading them", async (t) => {
  const value = await fixture(t);
  for (const hostEnvironment of [null, [], "env", 1, { SAFE: 1 }, { SAFE: null }, { SAFE: undefined }, { SAFE: {} }]) {
    await rejectBeforeLaunch(value, { ...value.options, hostEnvironment }, "environment");
  }
  let reads = 0;
  const hostEnvironment = Object.defineProperty({}, "SAFE", { enumerable: true, get() { reads += 1; throw new Error(syntheticSecret); } });
  await rejectBeforeLaunch(value, { ...value.options, hostEnvironment }, "environment");
  assert.equal(reads, 0);
});

test("Pi CLI probe sanitizes exceptions raised while inspecting the unknown environment", async (t) => {
  const value = await fixture(t);
  const hostEnvironment = new Proxy({}, { ownKeys() { throw new Error(syntheticSecret); } });
  await rejectBeforeLaunch(value, { ...value.options, hostEnvironment }, "environment");
});

for (const [name, mutation, code] of [
  ["package name", { name: "synthetic-other-package" }, "package"],
  ["package version", { version: "0.84.2" }, "package"],
  ["missing bin", { bin: {} }, "entry"],
  ["string bin", { bin: "dist/cli.js" }, "entry"],
  ["alternate public entry", { bin: { pi: "dist/rpc-entry.js" } }, "entry"],
  ["escaped bin", { bin: { pi: "../synthetic-outside.js" } }, "entry"],
] as const) {
  test(`Pi CLI probe rejects ${name} drift before launch`, async (t) => {
    const value = await fixture(t);
    await writeFile(join(value.packageDirectory, "package.json"), JSON.stringify({ ...packageManifest, ...mutation }));
    await rejectBeforeLaunch(value, value.options, code);
  });
}

for (const manifest of ["{", "null", "[]", `{"name":"${syntheticSecret}"}`]) {
  test(`Pi CLI probe rejects malformed package manifest ${JSON.stringify(manifest.slice(0, 8))}`, async (t) => {
    const value = await fixture(t);
    await writeFile(join(value.packageDirectory, "package.json"), manifest);
    await rejectBeforeLaunch(value, value.options, "package");
  });
}

test("Pi CLI probe rejects a missing package manifest", async (t) => {
  const value = await fixture(t);
  await rm(join(value.packageDirectory, "package.json"));
  await rejectBeforeLaunch(value, value.options, "package");
});

test("Pi CLI probe rejects a manifest symlink outside the canonical package", async (t) => {
  const value = await fixture(t);
  const manifest = join(value.packageDirectory, "package.json");
  const outside = join(value.root, "outside-manifest.json");
  await writeFile(outside, JSON.stringify(packageManifest));
  await rm(manifest);
  await symlink(outside, manifest, "file");
  await rejectBeforeLaunch(value, value.options, "package");
});

for (const kind of ["missing", "directory", "escaped-entry-symlink", "escaped-dist-symlink"] as const) {
  test(`Pi CLI probe rejects ${kind} CLI entry`, async (t) => {
    const value = await fixture(t);
    const outside = join(value.root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "cli.js"), await readFile(value.entry));
    await rm(value.entry);
    if (kind === "directory") await mkdir(value.entry);
    if (kind === "escaped-entry-symlink") await symlink(join(outside, "cli.js"), value.entry, "file");
    if (kind === "escaped-dist-symlink") {
      await rm(dirname(value.entry), { recursive: true });
      await symlink(outside, dirname(value.entry), "dir");
    }
    await rejectBeforeLaunch(value, value.options, "entry");
  });
}

for (const field of ["workspaceDirectory", "stateDirectory"] as const) {
  for (const kind of ["missing", "file", "symlink", "populated"] as const) {
    test(`Pi CLI probe rejects ${kind} ${field}`, async (t) => {
      const value = await fixture(t);
      const directory = value.options[field];
      if (kind === "populated") {
        await writeFile(join(directory, "synthetic-existing.txt"), syntheticSecret);
      } else {
        await rm(directory, { recursive: true });
        if (kind === "file") await writeFile(directory, syntheticSecret);
        if (kind === "symlink") {
          const outside = join(value.root, "outside-empty");
          await mkdir(outside);
          await symlink(outside, directory, "dir");
        }
      }
      await rejectBeforeLaunch(value, value.options, "directories");
    });
  }
}

test("Pi CLI probe rejects overlapping workspace, state, and package directories", async (t) => {
  const value = await fixture(t);
  for (const options of [
    { ...value.options, stateDirectory: value.options.workspaceDirectory },
    { ...value.options, stateDirectory: value.root },
    { ...value.options, workspaceDirectory: value.root },
    { ...value.options, stateDirectory: value.packageDirectory },
    { ...value.options, workspaceDirectory: value.packageDirectory },
  ]) {
    await rejectBeforeLaunch(value, options, "directories");
  }
});

for (const field of ["workspaceDirectory", "stateDirectory"] as const) {
  test(`Pi CLI probe refuses pre-existing .pi/agent configuration in ${field}`, async (t) => {
    const value = await fixture(t);
    const configuration = join(value.options[field], ".pi", "agent");
    await mkdir(configuration, { recursive: true });
    await writeFile(join(configuration, "settings.json"), syntheticSecret);
    await rejectBeforeLaunch(value, value.options, "directories");
    assert.equal(await readFile(join(configuration, "settings.json"), "utf8"), syntheticSecret);
  });
}

test("Pi CLI probe accepts a UTF-8 codepoint split across actual child writes", async (t) => {
  const value = await fixture(t, `
await requestsReady;
state.data.sessionId = "synthetic-中-\\u2028-\\u2029";
const bytes = Buffer.from(JSON.stringify(state) + "\\n");
const boundary = bytes.indexOf(Buffer.from("中")) + 1;
await new Promise((resolve) => process.stdout.write(bytes.subarray(0, boundary), resolve));
await new Promise((resolve) => setTimeout(resolve, 20));
process.stdout.write(bytes.subarray(boundary));
send(messages);
await inputEnded;
`);
  assert.equal((await runPiCliStateProbe(value.options)).status, "ok");
  assertChildGone(value);
  await assertOwnStateClean(value);
});

for (const [name, emitted] of [
  ["empty record", `process.stdout.write("\\n");`],
  ["CRLF", `process.stdout.write(JSON.stringify(state) + "\\r\\n");`],
  ["malformed JSON", `process.stdout.write(syntheticSecret + "\\n");`],
  ["unterminated JSON tail", `process.stdout.write(JSON.stringify(state));`],
  ["whitespace record", `process.stdout.write(" \\n");`],
  ["invalid UTF-8", `process.stdout.write(Buffer.from([0xff, 0x0a]));`],
  ["overlong UTF-8", `process.stdout.write(Buffer.from([0xc0, 0xaf, 0x0a]));`],
  ["UTF-8 BOM", `process.stdout.write(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(state) + "\\n")]));`],
] as const) {
  test(`Pi CLI probe rejects ${name} framing`, async (t) => {
    await rejectChild(t, `await requestsReady; ${emitted} process.stdin.destroy();`, "invalid-jsonl");
  });
}

test("Pi CLI probe rejects an invalid UTF-8 sequence split across child writes", async (t) => {
  await rejectChild(t, `
await requestsReady;
process.stdout.write(Buffer.from([0xe4]));
await new Promise((resolve) => setTimeout(resolve, 20));
process.stdout.write(Buffer.from([0x41, 0x0a]));
process.stdin.destroy();
`, "invalid-jsonl");
});

test("Pi CLI probe accepts the exact 32768-byte JSON record bound", async (t) => {
  const value = await fixture(t, `
await requestsReady;
state.data.sessionName = "";
state.data.sessionName = "s".repeat(32768 - Buffer.byteLength(JSON.stringify(state)));
assert.equal(Buffer.byteLength(JSON.stringify(state)), 32768);
send(state);
send(messages);
await inputEnded;
`);
  assert.equal((await runPiCliStateProbe(value.options)).status, "ok");
  assertChildGone(value);
  await assertOwnStateClean(value);
});

test("Pi CLI probe rejects a 32769-byte record even when the LF arrives in the same write", async (t) => {
  await rejectChild(t, `
await requestsReady;
state.data.sessionName = "";
state.data.sessionName = "s".repeat(32769 - Buffer.byteLength(JSON.stringify(state)));
send(state);
setInterval(() => {}, 1000);
`, "stdout-limit");
});

for (const length of [32769, 131073]) {
  test(`Pi CLI probe bounds ${length} bytes of unterminated stdout`, async (t) => {
    await rejectChild(t, `await requestsReady; process.stdout.write("s".repeat(${length})); setInterval(() => {}, 1000);`, "stdout-limit");
  });
}

test("Pi CLI probe measures the stdout record limit in UTF-8 bytes", async (t) => {
  await rejectChild(t, `await requestsReady; process.stdout.write("中".repeat(11000)); setInterval(() => {}, 1000);`, "stdout-limit");
});

test("Pi CLI probe accepts exactly 16384 bytes of stderr without exposing it", async (t) => {
  const value = await fixture(t, `await requestsReady; process.stderr.write("s".repeat(16384)); send(state); send(messages); await inputEnded;`);
  assert.equal((await runPiCliStateProbe(value.options)).stderrPresent, true);
  assertChildGone(value);
  await assertOwnStateClean(value);
});

test("Pi CLI probe rejects stderr above 16384 bytes and waits for child cleanup", async (t) => {
  await rejectChild(t, `await requestsReady; process.stderr.write("s".repeat(16385)); setInterval(() => {}, 1000);`, "stderr-limit");
});

for (const [name, response] of [
  ["nonobject", null],
  ["array", []],
  ["unexpected event", { type: "agent_start" }],
  ["failure response", { ...successfulState, success: false, error: syntheticSecret }],
  ["nonboolean success", { ...successfulState, success: "true" }],
  ["missing state data", { ...successfulState, data: undefined }],
  ["null state data", { ...successfulState, data: null }],
  ["empty session identity", { ...successfulState, data: { sessionId: "", isStreaming: false } }],
  ["nonstring session identity", { ...successfulState, data: { sessionId: 1, isStreaming: false } }],
  ["nonboolean streaming", { ...successfulState, data: { sessionId: "synthetic", isStreaming: "false" } }],
  ["running state", { ...successfulState, data: { sessionId: "synthetic", isStreaming: true } }],
  ["missing messages", { ...successfulMessages, data: {} }],
  ["nonarray messages", { ...successfulMessages, data: { messages: null } }],
  ["unexpected conversation", { ...successfulMessages, data: { messages: [{ role: "user", content: syntheticSecret }] } }],
] as const) {
  test(`Pi CLI probe rejects ${name}`, async (t) => {
    await rejectChild(t, `await requestsReady; send(${JSON.stringify(response)}); setInterval(() => {}, 1000);`, "invalid-response");
  });
}

for (const [name, response] of [
  ["unknown response ID", { ...successfulState, id: syntheticSecret }],
  ["mismatched state command", { ...successfulState, command: "get_messages" }],
  ["mismatched messages command", { ...successfulMessages, command: "get_state" }],
] as const) {
  test(`Pi CLI probe rejects ${name}`, async (t) => {
    await rejectChild(t, `await requestsReady; send(${JSON.stringify(response)}); setInterval(() => {}, 1000);`, "correlation");
  });
}

test("Pi CLI probe rejects an early duplicate before the second response", async (t) => {
  await rejectChild(t, `await requestsReady; send(state); send(state); setInterval(() => {}, 1000);`, "duplicate-response");
});

for (const count of [0, 1]) {
  test(`Pi CLI probe rejects normal child close with ${count} of two required responses`, async (t) => {
    await rejectChild(t, `await requestsReady; ${count ? "send(state);" : ""} process.stdin.destroy();`, "missing-response");
  });
}

test("Pi CLI probe rejects early nonzero exit", async (t) => {
  await rejectChild(t, `await requestsReady; process.exitCode = 7; process.stdin.destroy();`, "premature-exit");
});

test("Pi CLI probe rejects signal termination", async (t) => {
  await rejectChild(t, `await requestsReady; process.kill(process.pid, "SIGTERM");`, "premature-exit");
});

for (const [name, afterEnd, code] of [
  ["late duplicate", "send(state);", "duplicate-response"],
  ["late malformed record", 'process.stdout.write(syntheticSecret + "\\n");', "invalid-jsonl"],
  ["late unterminated tail", "process.stdout.write(syntheticSecret);", "invalid-jsonl"],
  ["late event", 'send({ type: "agent_start" });', "invalid-response"],
  ["late oversized stdout", 'process.stdout.write("s".repeat(32769));', "stdout-limit"],
  ["late oversized stderr", 'process.stderr.write("s".repeat(16385));', "stderr-limit"],
  ["late nonzero exit", "process.exitCode = 7;", "premature-exit"],
] as const) {
  test(`Pi CLI probe rejects ${name} after both valid responses and stdin EOF`, async (t) => {
    await rejectChild(t, `await requestsReady; send(state); send(messages); await inputEnded; ${afterEnd}`, code);
  });
}

test("Pi CLI probe waits for natural close after both responses, and times out if the child stays alive", async (t) => {
  await rejectChild(t, `await requestsReady; send(state); send(messages); await inputEnded; setInterval(() => {}, 1000);`, "timeout", 500);
});

test("Pi CLI probe still requires natural child close after both responses and stdout EOF", async (t) => {
  await rejectChild(t, `await requestsReady; send(state); send(messages); await inputEnded; process.stdout.end(); setInterval(() => {}, 1000);`, "timeout", 500);
});

test("Pi CLI probe escalates a TERM-resistant timeout and reaps the child before rejecting", async (t) => {
  const value = await rejectChild(t, `
process.on("SIGTERM", () => writeFileSync(observationFile, "TERM observed"));
await requestsReady;
setInterval(() => {}, 1000);
`, "timeout", 500);
  assert.equal(await readFile(value.observationFile, "utf8"), "TERM observed");
});

test("Pi CLI probe preserves the first protocol failure through TERM resistance and later output", async (t) => {
  const value = await rejectChild(t, `
process.on("SIGTERM", () => {
  writeFileSync(observationFile, "TERM observed");
  process.stderr.write("s".repeat(16385));
  send(state);
  send(state);
});
await requestsReady;
process.stdout.write(syntheticSecret + "\\n");
setInterval(() => {}, 1000);
`, "invalid-jsonl", 500);
  assert.equal(await readFile(value.observationFile, "utf8"), "TERM observed");
});

function consumer(value: Fixture, script: string, overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--experimental-strip-types", script], {
    cwd: value.root,
    env: {
      PI_PACKAGE_DIR: value.packageDirectory,
      PI_PROBE_CWD: value.options.workspaceDirectory,
      PI_PROBE_STATE_DIR: value.options.stateDirectory,
      ...overrides,
    },
    encoding: "utf8",
    timeout: 5_000,
    killSignal: "SIGKILL",
    maxBuffer: 131_072,
  });
}

const consumerScript = fileURLToPath(new URL("../../../scripts/probes/pi-rpc-state.mjs", import.meta.url));

test("The actual Artifact consumer preserves its successful JSON result contract with an explicit clean environment", async (t) => {
  const value = await fixture(t);
  const result = consumer(value, consumerScript);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    status: "ok",
    package: "@earendil-works/pi-coding-agent@0.84.1",
    node: "22.23.1",
    executionMode: "node-cli-entry",
    sessionIdPresent: true,
    isStreaming: false,
    messageCount: 0,
    credentialsUsed: false,
    promptsSent: 0,
    stderrPresent: false,
  });
  assertChildGone(value);
  await assertOwnStateClean(value);
});

test("The actual Artifact consumer reports malformed child stdout without reflecting its bytes or paths", async (t) => {
  const value = await fixture(t, `await requestsReady; process.stdout.write(syntheticSecret + "\\n"); setInterval(() => {}, 1000);`);
  const result = consumer(value, consumerScript);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Pi CLI state probe failed: invalid-jsonl.\n");
  assert.equal(result.stderr.includes(syntheticSecret), false);
  assert.equal(result.stderr.includes(value.root), false);
  assertChildGone(value);
  await assertOwnStateClean(value);
});

for (const key of ["SYNTHETIC_API_KEY", "PI_EXECUTABLE", "PI_EXECUTABLE_ARGS_JSON", "HTTPS_PROXY"]) {
  test(`The actual Artifact consumer rejects ${key} host contamination before launching`, async (t) => {
    const value = await fixture(t);
    const result = consumer(value, consumerScript, { [key]: syntheticSecret });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Pi CLI state probe failed: environment.\n");
    assert.equal(existsSync(value.pidFile), false);
    await assertOwnStateClean(value);
  });
}

test("The actual consumer imports its strict TypeScript contract from a read-only curated bundle without package.json", async (t) => {
  const value = await fixture(t);
  const bundle = join(value.root, "curated-source");
  const files = [
    "scripts/probes/pi-rpc-state.mjs",
    "packages/pi-adapter/fixtures/pi-cli-state-contract.ts",
    "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs",
  ];
  for (const path of files) {
    const destination = join(bundle, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(new URL(`../../../${path}`, import.meta.url)), { mode: 0o444 });
    for (let directory = dirname(destination); directory.startsWith(bundle); directory = dirname(directory)) {
      if (!value.readOnlyDirectories.includes(directory)) value.readOnlyDirectories.push(directory);
    }
  }
  for (const directory of value.readOnlyDirectories) await chmod(directory, 0o555);
  assert.equal(existsSync(join(bundle, "package.json")), false);
  assert.equal(existsSync(join(value.root, "package.json")), false);
  const result = consumer(value, join(bundle, files[0]));
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).status, "ok");
  assertChildGone(value);
  await assertOwnStateClean(value);
});
