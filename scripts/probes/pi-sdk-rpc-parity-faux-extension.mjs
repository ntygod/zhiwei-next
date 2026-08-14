import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import registerSdkRpcProbe from "../../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-capture-base.mjs";

export default registerSdkRpcProbe;

const thisFile = fileURLToPath(import.meta.url);
const isDirectExecution =
  typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(thisFile);
const baseCapturePath = fileURLToPath(
  new URL(
    "../../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-capture-base.mjs",
    import.meta.url,
  ),
);
const strictReaderPath = fileURLToPath(
  new URL(
    "../../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-jsonl-reader.mjs",
    import.meta.url,
  ),
);
const contractSourcePath = fileURLToPath(
  new URL("./pi-sdk-rpc-parity-contract.mjs", import.meta.url),
);
const BASE_CAPTURE_GIT_BLOB_SHA = "39cbf5741f524027e0e9f8197c27e4f611566055";
const HARDENED_CAPTURE_TIMEOUT_MS = 150_000;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  requireValue(first >= 0, `RPC capture base is missing ${label}.`);
  requireValue(
    source.indexOf(before, first + before.length) === -1,
    `RPC capture base contains duplicate ${label}.`,
  );
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function hardenRpcWorkerCaptureSource(baseSource) {
  requireValue(
    gitBlobSha(baseSource) === BASE_CAPTURE_GIT_BLOB_SHA,
    "RPC capture base Git blob identity drifted.",
  );
  let source =
    `import { isDeepStrictEqual } from "node:util";\n` +
    `import { StrictLfJsonlReader } from ${JSON.stringify(
      pathToFileURL(strictReaderPath).href,
    )};\n` +
    baseSource;

  source = replaceExactlyOnce(
    source,
    `    this.stdoutBuffer = "";\n`,
    `    this.stdoutReader = new StrictLfJsonlReader({\n` +
      `      label: this.name,\n` +
      `      onRecord: (object) =>\n` +
      `        this.record(summarizeProtocolObject(object, this.aliases), object),\n` +
      `    });\n`,
    "RpcWorker stdout buffer construction",
  );

  source = replaceExactlyOnce(
    source,
    `  parseStdoutChunk(chunk) {\n` +
      `    this.stdoutBuffer += chunk.toString("utf8");\n` +
      `    while (true) {\n` +
      `      const newlineIndex = this.stdoutBuffer.indexOf("\\n");\n` +
      `      if (newlineIndex < 0) break;\n` +
      `      let line = this.stdoutBuffer.slice(0, newlineIndex);\n` +
      `      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);\n` +
      `      if (line.endsWith("\\r")) line = line.slice(0, -1);\n` +
      `      if (line.length === 0) continue;\n` +
      `      let object;\n` +
      `      try {\n` +
      `        object = JSON.parse(line);\n` +
      `      } catch (error) {\n` +
      `        this.fail(\n` +
      `          new Error(\n` +
      `            \`${"${this.name}"} emitted invalid JSONL record of length ${"${line.length}"}: ${"${error.message}"}\`,\n` +
      `          ),\n` +
      `        );\n` +
      `        return;\n` +
      `      }\n` +
      `      this.record(summarizeProtocolObject(object, this.aliases), object);\n` +
      `    }\n` +
      `  }\n`,
    `  parseStdoutChunk(chunk) {\n` +
      `    try {\n` +
      `      this.stdoutReader.push(chunk);\n` +
      `    } catch (error) {\n` +
      `      this.fail(error);\n` +
      `    }\n` +
      `  }\n`,
    "RpcWorker string JSONL parser",
  );

  source = replaceExactlyOnce(
    source,
    `      if (this.stdoutBuffer.length > 0) {\n` +
      `        this.fail(\n` +
      `          new Error(\n` +
      `            \`${"${this.name}"} closed with a non-LF-terminated stdout fragment of length ${"${this.stdoutBuffer.length}"}.\`,\n` +
      `          ),\n` +
      `        );\n` +
      `        return;\n` +
      `      }\n`,
    `      try {\n` +
      `        this.stdoutReader.end();\n` +
      `      } catch (error) {\n` +
      `        this.fail(error);\n` +
      `        return;\n` +
      `      }\n`,
    "RpcWorker string-fragment close check",
  );

  source = replaceExactlyOnce(
    source,
    `  requireValue(\n` +
      `    stateDuring.data?.isStreaming === true && stateDuring.data?.messageCount === 1,\n` +
      `    "Provider-error State after acceptance drifted.",\n` +
      `  );\n`,
    `  const runningStateVariant = structuredClone(state.data);\n` +
      `  runningStateVariant.isStreaming = true;\n` +
      `  runningStateVariant.messageCount = 1;\n` +
      `  const providerErrorStatePhase = isDeepStrictEqual(\n` +
      `    stateDuring.data,\n` +
      `    runningStateVariant,\n` +
      `  )\n` +
      `    ? "running"\n` +
      `    : isDeepStrictEqual(stateDuring.data, state.data)\n` +
      `      ? "settled"\n` +
      `      : undefined;\n` +
      `  requireValue(\n` +
      `    providerErrorStatePhase !== undefined,\n` +
      `    "Provider-error State escaped the complete running/settled variants.",\n` +
      `  );\n` +
      `  requireValue(\n` +
      `    ordering.stateDuringResponseSequence > ordering.promptResponseSequence,\n` +
      `    "Provider-error State Response must follow Prompt acceptance.",\n` +
      `  );\n` +
      `  if (providerErrorStatePhase === "running") {\n` +
      `    requireValue(\n` +
      `      ordering.stateDuringResponseSequence < ordering.agentSettledSequence,\n` +
      `      "A running Provider-error State Response must precede agent_settled output.",\n` +
      `    );\n` +
      `  }\n`,
    "Provider-error two-field State assertion",
  );

  source = replaceExactlyOnce(
    source,
    `    ordering.promptResponsePrecedesAgentStart === true &&\n` +
      `      ordering.failureExpressedAfterAcceptance === true &&\n` +
      `      ordering.stateDuringAfterAcceptanceBeforeSettled === true,\n`,
    `    ordering.promptResponsePrecedesAgentStart === true &&\n` +
      `      ordering.failureExpressedAfterAcceptance === true,\n`,
    "Provider-error race-sensitive ordering assertion",
  );

  requireValue(!source.includes("this.stdoutBuffer"), "Hardened capture still uses a string stdout buffer.");
  requireValue(
    !source.includes('if (line.endsWith("\\r"))') && !source.includes("if (line.length === 0) continue"),
    "Hardened capture still normalizes CRLF or skips empty records.",
  );
  return source;
}

async function runHardenedCapture() {
  const [baseSource, contractSource] = await Promise.all([
    readFile(baseCapturePath, "utf8"),
    readFile(contractSourcePath, "utf8"),
  ]);
  const hardenedSource = hardenRpcWorkerCaptureSource(baseSource);
  if (process.argv.includes("--verify-transform")) {
    const syntax = spawnSync(
      process.execPath,
      ["--check", "--input-type=module"],
      {
        input: hardenedSource,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    if (syntax.error) throw syntax.error;
    requireValue(
      syntax.status === 0,
      `Hardened RPC Worker capture syntax check failed: ${(
        syntax.stderr || syntax.stdout || ""
      ).trim()}`,
    );
    process.stdout.write(`RPC Worker hardened capture source: OK (${sha256(hardenedSource)}).\n`);
    return;
  }

  const sourceRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-hardened-source-"));
  const capturePath = join(sourceRoot, "pi-sdk-rpc-parity-faux-extension.mjs");
  const contractPath = join(sourceRoot, "pi-sdk-rpc-parity-contract.mjs");
  try {
    await Promise.all([
      writeFile(capturePath, hardenedSource, { flag: "wx", mode: 0o400 }),
      writeFile(contractPath, contractSource, { flag: "wx", mode: 0o400 }),
    ]);
    await Promise.all([chmod(capturePath, 0o400), chmod(contractPath, 0o400)]);
    await chmod(sourceRoot, 0o500);

    const child = spawn(process.execPath, [capturePath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    const result = await new Promise((resolveChild, rejectChild) => {
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Preserve timeout as the primary failure.
        }
        rejectChild(new Error(`Hardened RPC Worker capture exceeded ${HARDENED_CAPTURE_TIMEOUT_MS}ms.`));
      }, HARDENED_CAPTURE_TIMEOUT_MS);
      timer.unref?.();
      child.once("error", (error) => {
        clearTimeout(timer);
        rejectChild(error);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolveChild({ code, signal });
      });
    });
    requireValue(
      result.code === 0 && result.signal === null,
      `Hardened RPC Worker capture closed with code=${result.code ?? "null"}, signal=${
        result.signal ?? "null"
      }.`,
    );
    const [captureAfter, contractAfter] = await Promise.all([
      readFile(capturePath, "utf8"),
      readFile(contractPath, "utf8"),
    ]);
    requireValue(
      sha256(captureAfter) === sha256(hardenedSource) &&
        sha256(contractAfter) === sha256(contractSource),
      "Hardened RPC Worker capture source changed while it executed.",
    );
  } finally {
    try {
      await chmod(sourceRoot, 0o700);
    } catch {
      // Best-effort permission restoration before recursive cleanup.
    }
    await rm(sourceRoot, { recursive: true, force: true });
  }
}

if (isDirectExecution) {
  try {
    await runHardenedCapture();
  } catch (error) {
    console.error(`RPC Worker hardened capture launcher failed: ${error.message}`);
    process.exitCode = 1;
  }
}
