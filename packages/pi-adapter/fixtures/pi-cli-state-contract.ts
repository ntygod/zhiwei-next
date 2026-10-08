import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import { StrictLfJsonlReader } from "./pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs";

// Internal zero-prompt fixture boundary, deliberately absent from the adapter barrel.
// The outer artifact runner still authenticates the package and supplies the OS sandbox.
const PACKAGE = "@earendil-works/pi-coding-agent";
const VERSION = "0.84.1";
const NODE = "22.23.1";
const RECORD_BYTES = 32_768;
const STDOUT_BYTES = 131_072;
const STDERR_BYTES = 16_384;
const ENV_SELECTORS = new Set(["PI_PACKAGE_DIR", "PI_PROBE_CWD", "PI_PROBE_STATE_DIR"]);
export type PiCliErrorCode = "configuration" | "environment" | "node-runtime" | "package" | "entry" | "directories" | "spawn" | "invalid-jsonl" | "stdout-limit" | "stderr-limit" | "invalid-response" | "correlation" | "duplicate-response" | "missing-response" | "premature-exit" | "transport" | "timeout" | "cleanup";
export class PiCliContractError extends Error {
  readonly code: PiCliErrorCode;
  constructor(code: PiCliErrorCode) {
    super(`Pi CLI state probe failed: ${code}.`);
    this.name = "PiCliContractError";
    this.code = code;
  }
}
function fail(code: PiCliErrorCode): never { throw new PiCliContractError(code); }
function record(value: unknown, code: PiCliErrorCode): Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") fail(code);
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(code);
      output[key] = descriptor.value as unknown;
    }
    return output;
  } catch { return fail(code); }
}
function absolute(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || value.includes("\0") || !isAbsolute(value) || resolve(value) !== value) fail("configuration");
  return value;
}
function within(parent: string, child: string): boolean { return child === parent || child.startsWith(parent + sep); }
async function checked<T>(code: PiCliErrorCode, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error: unknown) { if (error instanceof PiCliContractError) throw error; return fail(code); }
}
function checkHostEnvironment(input: unknown): void {
  const environment = record(input, "environment");
  if (Object.keys(environment).length > 512) fail("environment");
  for (const [key, value] of Object.entries(environment)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string") fail("environment");
    if (/^NODE_/i.test(key) || /proxy|KEY|TOKEN|SECRET|PASSW(?:OR)?D|CREDENTIAL|AUTH/i.test(key) || (/^PI_/i.test(key) && !ENV_SELECTORS.has(key))) fail("environment");
  }
}
async function emptyOwnedDirectory(path: string): Promise<void> {
  await checked("directories", async () => {
    const info = await lstat(path);
    if (!info.isDirectory() || await realpath(path) !== path || (typeof process.getuid === "function" && info.uid !== process.getuid()) || (info.mode & 0o022) !== 0 || (await readdir(path)).length !== 0) fail("directories");
  });
}
async function packageEntry(directory: string): Promise<{ root: string; entry: string }> {
  return checked("package", async () => {
    // Published artifact installation uses a package-view symlink. Canonicalize
    // that directory, then require ordinary contained manifest and bin files.
    const root = await realpath(directory);
    if (!(await stat(root)).isDirectory()) fail("package");
    const manifestPath = join(root, "package.json");
    if (!(await lstat(manifestPath)).isFile()) fail("package");
    const handle = await open(manifestPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let manifest: Record<string, unknown>;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 65_536) fail("package");
      const bytes = Buffer.alloc(65_537);
      let length = 0;
      while (length < bytes.length) {
        const read = await handle.read(bytes, length, bytes.length - length, null);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
      }
      if (length > 65_536) fail("package");
      manifest = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))) as unknown, "package");
    } finally { await handle.close(); }
    if (manifest.name !== PACKAGE || manifest.version !== VERSION) fail("package");
    const bin = record(manifest.bin, "entry");
    if (Object.keys(bin).length !== 1 || bin.pi !== "dist/cli.js") fail("entry");
    const entry = join(root, "dist", "cli.js");
    await checked("entry", async () => {
      const info = await lstat(entry);
      if (!info.isFile() || await realpath(entry) !== entry) fail("entry");
      await access(entry, constants.R_OK);
    });
    return { root, entry };
  });
}
export interface PiCliStateResult {
  readonly status: "ok";
  readonly package: "@earendil-works/pi-coding-agent@0.84.1";
  readonly node: "22.23.1";
  readonly executionMode: "node-cli-entry";
  readonly sessionIdPresent: true;
  readonly isStreaming: false;
  readonly messageCount: 0;
  readonly credentialsUsed: false;
  readonly promptsSent: 0;
  readonly stderrPresent: boolean;
}
interface Launch {
  readonly entry: string;
  readonly node: string;
  readonly workspace: string;
  readonly runDirectory: string;
  readonly deadlineMs: number;
}
function runChild(launch: Launch): Promise<PiCliStateResult> {
  const environment = {
    HOME: join(launch.runDirectory, "home"), USERPROFILE: join(launch.runDirectory, "home"),
    XDG_CONFIG_HOME: join(launch.runDirectory, "home", ".config"),
    PI_CODING_AGENT_DIR: join(launch.runDirectory, "agent"),
    TMPDIR: join(launch.runDirectory, "tmp"), TMP: join(launch.runDirectory, "tmp"), TEMP: join(launch.runDirectory, "tmp"),
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NO_COLOR: "1", FORCE_COLOR: "0", AI_AGENT: "zhiwei-pi-rpc-probe",
  };
  const args = [launch.entry, "--mode", "rpc", "--no-session", "--no-tools", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--offline", "--thinking", "off", "--session-dir", join(launch.runDirectory, "sessions")];
  return new Promise((resolvePromise, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try { child = spawn(launch.node, args, { cwd: launch.workspace, env: environment, stdio: ["pipe", "pipe", "pipe"], shell: false }); }
    catch { reject(new PiCliContractError("spawn")); return; }
    let done = false;
    let failure: PiCliContractError | undefined;
    let stdoutEnded = false;
    let inputEnded = false;
    let stdoutBytes = 0;
    let lineBytes = 0;
    let stderrBytes = 0;
    const received = new Set<string>();
    let termTimer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => stop("timeout"), launch.deadlineMs);
    function finish(error?: PiCliContractError): void {
      if (done) return;
      done = true;
      clearTimeout(deadline); clearTimeout(termTimer); clearTimeout(killTimer);
      // No raw stderr, response, OS error, file path or cause crosses this boundary.
      if (error) reject(error);
      else resolvePromise({ status: "ok", package: "@earendil-works/pi-coding-agent@0.84.1", node: NODE, executionMode: "node-cli-entry", sessionIdPresent: true, isStreaming: false, messageCount: 0, credentialsUsed: false, promptsSent: 0, stderrPresent: stderrBytes > 0 });
    }
    function stop(code: PiCliErrorCode): void {
      if (done || failure) return;
      failure = new PiCliContractError(code);
      child.stdin.destroy();
      // Always wait for close after termination. A kill request is not proof of exit.
      try { child.kill("SIGTERM"); } catch { /* Escalation below remains bounded. */ }
      termTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* The final bound reports cleanup. */ }
        killTimer = setTimeout(() => {
          child.stdout.destroy(); child.stderr.destroy(); child.unref();
          finish(new PiCliContractError("cleanup"));
        }, 1000);
      }, 250);
    }
    const reader = new StrictLfJsonlReader({ label: "pi-state", maxRecordBytes: RECORD_BYTES, onRecord: (input: unknown) => {
      const response = record(input, "invalid-response");
      if (Object.keys(response).some((key) => !["type", "id", "command", "success", "data", "error"].includes(key)) || response.type !== "response") fail("invalid-response");
      if (response.id !== "state-1" && response.id !== "messages-1") fail("correlation");
      if (received.has(response.id)) fail("duplicate-response");
      if (response.command !== (response.id === "state-1" ? "get_state" : "get_messages")) fail("correlation");
      if (response.success !== true || response.error !== undefined) fail("invalid-response");
      const data = record(response.data, "invalid-response");
      if (response.id === "state-1") {
        if (typeof data.sessionId !== "string" || data.sessionId.length === 0 || data.sessionId.length > 1024 || data.isStreaming !== false || (data.messageCount !== undefined && data.messageCount !== 0)) fail("invalid-response");
      } else if (!Array.isArray(data.messages) || data.messages.length !== 0) fail("invalid-response");
      received.add(response.id);
    } });
    child.stdout.on("data", (chunk: Buffer) => {
      if (done || failure) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > STDOUT_BYTES) { stop("stdout-limit"); return; }
      for (const byte of chunk) {
        if (byte === 0x0a) lineBytes = 0;
        else if (++lineBytes > RECORD_BYTES) { stop("stdout-limit"); return; }
      }
      try { reader.push(chunk); }
      catch (error: unknown) { stop(error instanceof PiCliContractError ? error.code : "invalid-jsonl"); return; }
      // Close stdin only after parsing the whole chunk. Continue reading until
      // stdout EOF AND a natural successful process close, including late output.
      if (received.size === 2 && !inputEnded) { inputEnded = true; child.stdin.end(); }
    });
    child.stdout.on("end", () => {
      stdoutEnded = true;
      if (done || failure) return;
      try { reader.end(); } catch { stop("invalid-jsonl"); }
    });
    child.stdout.on("error", () => stop("transport"));
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > STDERR_BYTES) stop("stderr-limit");
    });
    child.stderr.on("error", () => stop("transport"));
    child.stdin.on("error", () => stop("transport"));
    child.on("error", () => stop("spawn"));
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (failure) { finish(failure); return; }
      if (code !== 0 || signal !== null || !stdoutEnded) { finish(new PiCliContractError("premature-exit")); return; }
      if (received.size !== 2 || !inputEnded) { finish(new PiCliContractError("missing-response")); return; }
      finish();
    });
    child.stdin.write('{"id":"state-1","type":"get_state"}\n{"id":"messages-1","type":"get_messages"}\n');
  });
}
export async function runPiCliStateProbe(input: unknown): Promise<PiCliStateResult> {
  const options = record(input, "configuration");
  const required = ["packageDirectory", "nodeExecutable", "workspaceDirectory", "stateDirectory", "hostEnvironment"];
  if (required.some((key) => !Object.hasOwn(options, key)) || Object.keys(options).some((key) => ![...required, "deadlineMs"].includes(key))) fail("configuration");
  checkHostEnvironment(options.hostEnvironment);
  const packageDirectory = absolute(options.packageDirectory);
  const node = absolute(options.nodeExecutable);
  const workspace = absolute(options.workspaceDirectory);
  const state = absolute(options.stateDirectory);
  const deadlineMs = options.deadlineMs === undefined ? 15_000 : options.deadlineMs;
  if (typeof deadlineMs !== "number" || !Number.isSafeInteger(deadlineMs) || deadlineMs < 50 || deadlineMs > 15_000) fail("configuration");
  await checked("node-runtime", async () => {
    if (process.versions.node !== NODE || await realpath(node) !== await realpath(process.execPath) || !(await stat(node)).isFile()) fail("node-runtime");
    await access(node, constants.X_OK);
  });
  const { root, entry } = await packageEntry(packageDirectory);
  const overlap = (a: string, b: string) => within(a, b) || within(b, a);
  if (overlap(workspace, state) || overlap(root, workspace) || overlap(root, state)) fail("directories");
  await emptyOwnedDirectory(workspace);
  await emptyOwnedDirectory(state);
  const runDirectory = await checked("directories", () => mkdtemp(join(state, "pi-state-")));
  let result: PiCliStateResult;
  try {
    await checked("directories", async () => {
      for (const path of ["home", "home/.config", "agent", "tmp", "sessions"]) await mkdir(join(runDirectory, path), { mode: 0o700 });
    });
    result = await runChild({ entry, node, workspace, runDirectory, deadlineMs });
  } finally {
    await checked("cleanup", () => rm(runDirectory, { recursive: true, force: true }));
  }
  return result;
}
