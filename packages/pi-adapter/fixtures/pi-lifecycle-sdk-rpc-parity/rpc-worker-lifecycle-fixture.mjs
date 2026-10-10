import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDir, "../../../../");
const basePath = join(fixtureDir, "rpc-worker-lifecycle-fixture-base.mjs");
const normalizerPath = join(fixtureDir, "rpc-worker-lifecycle-normalizer.mjs");
const historicalFixturePath = join(fixtureDir, "rpc-worker-lifecycle-base-fixture.mjs");
const checkerPath = join(
  repositoryRoot,
  "scripts/check-pi-sdk-rpc-client-messages-result.mjs",
);
export const RPC_WORKER_V2_MANIFEST_PATH = join(
  fixtureDir,
  "rpc-worker-lifecycle-manifest-v2.json",
);

const BASE_GIT_BLOB_SHA = "1cdb52af1d8a8172f1c1ddd43299a6387c3b4e09";
const MAX_BYTES = 4 * 1024 * 1024;
let transformedModulePromise;

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
  requireValue(first >= 0, `RPC Worker v2 Fixture base is missing ${label}.`);
  requireValue(
    source.indexOf(before, first + before.length) === -1,
    `RPC Worker v2 Fixture base contains duplicate ${label}.`,
  );
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function relocateRpcWorkerV2FixtureSource(baseSource) {
  requireValue(
    gitBlobSha(baseSource) === BASE_GIT_BLOB_SHA,
    "RPC Worker v2 Fixture base Git blob identity drifted.",
  );
  let source = replaceExactlyOnce(
    baseSource,
    'from "./rpc-worker-lifecycle-normalizer.mjs"',
    `from ${JSON.stringify(pathToFileURL(normalizerPath).href)}`,
    "normalizer import",
  );
  source = replaceExactlyOnce(
    source,
    'from "./rpc-worker-lifecycle-base-fixture.mjs"',
    `from ${JSON.stringify(pathToFileURL(historicalFixturePath).href)}`,
    "historical Fixture import",
  );
  source = replaceExactlyOnce(
    source,
    `const fixtureDir = dirname(fileURLToPath(import.meta.url));\n` +
      `const repositoryRoot = resolve(fixtureDir, "../../../../");\n`,
    `const fixtureDir = ${JSON.stringify(fixtureDir)};\n` +
      `const repositoryRoot = ${JSON.stringify(repositoryRoot)};\n`,
    "repository paths",
  );
  source = replaceExactlyOnce(
    source,
    `  await validateRepositoryIntegration(manifest);\n`,
    "",
    "obsolete in-module repository integration assertion",
  );
  return source;
}

async function loadTransformedModule() {
  if (!transformedModulePromise) {
    transformedModulePromise = (async () => {
      const source = relocateRpcWorkerV2FixtureSource(await readFile(basePath, "utf8"));
      const tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-v2-loader-"));
      const modulePath = join(tempRoot, "fixture.mjs");
      await writeFile(modulePath, source, { flag: "wx", mode: 0o400 });
      try {
        return await import(`${pathToFileURL(modulePath).href}?sha=${BASE_GIT_BLOB_SHA}`);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    })();
  }
  return transformedModulePromise;
}

export async function readRpcWorkerV2Fixture(
  manifestPath = RPC_WORKER_V2_MANIFEST_PATH,
) {
  const module = await loadTransformedModule();
  return module.readRpcWorkerV2Fixture(manifestPath);
}

export async function withRpcWorkerV2Fixture(callback) {
  const module = await loadTransformedModule();
  return module.withRpcWorkerV2Fixture(callback);
}

function runChecker(path) {
  const result = spawnSync(
    process.execPath,
    [checkerPath, "--rpc-worker-lifecycle", path],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: MAX_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw result.error;
  requireValue(
    result.status === 0,
    `RPC Worker v2 checker failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`,
  );
  process.stdout.write(result.stdout);
}

async function readBoundedJson(path, label) {
  const handle = await open(resolve(path), "r");
  try {
    const stat = await handle.stat({ bigint: true });
    requireValue(stat.isFile() && stat.size <= BigInt(MAX_BYTES), `${label} size is invalid.`);
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_BYTES + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      requireValue(total <= MAX_BYTES, `${label} exceeds its byte limit.`);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks, total);
    const text = bytes.toString("utf8");
    requireValue(Buffer.from(text, "utf8").equals(bytes), `${label} must be valid UTF-8.`);
    return JSON.parse(text);
  } finally {
    await handle.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const compareIndex = args.indexOf("--compare");
  const outputIndex = args.indexOf("--output");
  const verifyOnly = args.includes("--verify-only");
  const verifyTransform = args.includes("--verify-transform");
  requireValue(
    [compareIndex >= 0, outputIndex >= 0, verifyOnly, verifyTransform].filter(Boolean)
      .length <= 1,
    "Choose at most one Fixture mode.",
  );
  if (verifyTransform) {
    const source = relocateRpcWorkerV2FixtureSource(await readFile(basePath, "utf8"));
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], {
      input: source,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: MAX_BYTES,
    });
    if (syntax.error) throw syntax.error;
    requireValue(
      syntax.status === 0,
      `Relocated RPC Worker v2 Fixture syntax failed: ${(syntax.stderr || syntax.stdout || "").trim()}`,
    );
    console.log(`Relocated RPC Worker v2 Fixture source: OK (${BASE_GIT_BLOB_SHA}).`);
    return;
  }
  if (compareIndex >= 0) {
    const freshPath = args[compareIndex + 1];
    requireValue(Boolean(freshPath), "--compare requires a fresh result path.");
    await withRpcWorkerV2Fixture(async ({ path, result, manifest }) => {
      runChecker(path);
      runChecker(freshPath);
      const fresh = await readBoundedJson(freshPath, "Fresh RPC Worker v2 result");
      requireValue(
        JSON.stringify(fresh) === JSON.stringify(result),
        `Fresh RPC Worker v2 result differs from committed Fixture: committed=${
          manifest.outerContractFingerprint
        }, fresh=${fresh.contractFingerprint ?? "<missing>"}.`,
      );
    });
    console.log("Fresh RPC Worker v2 result matches the complete committed Fixture object.");
    return;
  }
  if (outputIndex >= 0) {
    const outputPath = args[outputIndex + 1];
    requireValue(Boolean(outputPath), "--output requires a destination path.");
    const fixture = await readRpcWorkerV2Fixture();
    await writeFile(resolve(outputPath), fixture.jsonBytes, { flag: "wx", mode: 0o600 });
    console.log(`Materialized RPC Worker v2 Fixture at ${resolve(outputPath)}.`);
    return;
  }
  if (verifyOnly) {
    const fixture = await readRpcWorkerV2Fixture();
    console.log(
      `RPC Worker v2 Fixture content: OK (${fixture.manifest.outerContractFingerprint}).`,
    );
    return;
  }
  await withRpcWorkerV2Fixture(async ({ path, manifest }) => {
    runChecker(path);
    console.log(
      `RPC Worker v2 committed Fixture: OK (${manifest.outerContractFingerprint}).`,
    );
  });
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(`RPC Worker v2 Fixture validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
