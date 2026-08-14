import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(
  repositoryRoot,
  "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity",
);
const basePath = join(
  fixtureDir,
  "rpc-worker-lifecycle-normalized-checker-base.mjs",
);
const legacyCheckerPath = join(
  fixtureDir,
  "rpc-worker-lifecycle-legacy-checker.mjs",
);
const BASE_CHECKER_GIT_BLOB_SHA = "2814f3d5cf2df30fa7856d7ebb433fc7e694be1f";

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

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  requireValue(first >= 0, `Normalized checker base is missing ${label}.`);
  requireValue(
    source.indexOf(before, first + before.length) === -1,
    `Normalized checker base contains duplicate ${label}.`,
  );
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function relocateNormalizedCheckerSource(baseSource) {
  requireValue(
    gitBlobSha(baseSource) === BASE_CHECKER_GIT_BLOB_SHA,
    "Normalized checker base Git blob identity drifted.",
  );
  let source = replaceExactlyOnce(
    baseSource,
    `const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");\n` +
      `const legacyChecker = join(\n` +
      `  repositoryRoot,\n` +
      `  "scripts/check-pi-sdk-rpc-client-messages-legacy-result.mjs",\n` +
      `);\n`,
    `const repositoryRoot = ${JSON.stringify(repositoryRoot)};\n` +
      `const legacyChecker = ${JSON.stringify(legacyCheckerPath)};\n`,
    "repository and legacy Checker paths",
  );
  source = replaceExactlyOnce(
    source,
    `  // Compatibility-only view for the legacy invariant checker. This object is\n` +
      `  // written to an isolated temporary file and is never committed or compared\n` +
      `  // as Runtime evidence; the normalized Fixture above remains authoritative.\n` +
      `  const projected = structuredClone(result);\n` +
      `  const providerError = projected.capture.cases.acceptedProviderError;\n` +
      `  providerError.stateDuring = structuredClone(providerError.finalState);\n` +
      `  providerError.stateDuring.isStreaming = true;\n` +
      `  providerError.stateDuring.messageCount = 1;\n` +
      `  providerError.ordering.stateDuringAfterAcceptanceBeforeSettled = true;\n` +
      `  delete projected.capture.contractFingerprint;\n` +
      `  projected.capture.contractFingerprint = fingerprint(projected.capture);\n` +
      `  delete projected.contractFingerprint;\n` +
      `  projected.contractFingerprint = fingerprint(projected);\n` +
      `\n` +
      `  const temporaryRoot = await mkdtemp(\n` +
      `    join(tmpdir(), "zhiwei-rpc-worker-legacy-check-"),\n` +
      `  );\n` +
      `  const projectedPath = join(temporaryRoot, "result.json");\n` +
      `  try {\n` +
      `    await writeFile(\n` +
      `      projectedPath,\n` +
      `      \`${"${JSON.stringify(projected, null, 2)}"}\\n\`,\n` +
      `      { flag: "wx", mode: 0o600 },\n` +
      `    );\n` +
      `    runLegacy(["--rpc-worker-lifecycle", projectedPath]);\n` +
      `  } finally {\n` +
      `    await rm(temporaryRoot, { recursive: true, force: true });\n` +
      `  }\n`,
    "",
    "synthetic Provider-error compatibility projection",
  );
  requireValue(
    !source.includes("providerError.stateDuring = structuredClone") &&
      !source.includes("stateDuringAfterAcceptanceBeforeSettled = true"),
    "Normalized checker transform retained synthetic Provider-error evidence.",
  );
  return source;
}

async function main() {
  const source = relocateNormalizedCheckerSource(await readFile(basePath, "utf8"));
  const verifyTransform = process.argv.includes("--verify-transform");
  const forwardedArgs = process.argv.slice(2).filter(
    (argument) => argument !== "--verify-transform",
  );
  const tempRoot = await mkdtemp(
    join(tmpdir(), "zhiwei-rpc-worker-normalized-checker-"),
  );
  const checkerPath = join(tempRoot, "checker.mjs");
  try {
    await writeFile(checkerPath, source, { flag: "wx", mode: 0o400 });
    const childArgs = verifyTransform
      ? ["--check", checkerPath]
      : [checkerPath, ...forwardedArgs];
    const child = spawn(process.execPath, childArgs, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    });
    const result = await new Promise((resolveChild, rejectChild) => {
      child.once("error", rejectChild);
      child.once("close", (code, signal) => resolveChild({ code, signal }));
    });
    requireValue(
      result.code === 0 && result.signal === null,
      `Normalized checker closed with code=${result.code ?? "null"}, signal=${
        result.signal ?? "null"
      }.`,
    );
    if (verifyTransform) {
      console.log("Relocated normalized RPC Worker checker source: syntax OK");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`RPC Worker normalized checker launcher failed: ${error.message}`);
  process.exitCode = 1;
}
