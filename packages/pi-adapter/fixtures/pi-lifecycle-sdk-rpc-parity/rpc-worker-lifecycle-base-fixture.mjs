import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDir, "../../../../");
const manifestPath = join(fixtureDir, "rpc-worker-lifecycle-manifest.json");
const checkerPath = join(fixtureDir, "rpc-worker-lifecycle-legacy-checker.mjs");
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_PART_BYTES = 1024 * 1024;
const MAX_COMPRESSED_BYTES = 4 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const PART_PATTERN = /^rpc-worker-lifecycle-part-(\d{2})-([0-9a-f]{64})\.b64$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function fingerprint(value) {
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return sha256(JSON.stringify(clone));
}

async function readBoundedRegular(path, maxBytes, label) {
  const before = await lstat(path, { bigint: true });
  requireValue(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular file.`);
  requireValue(before.size <= BigInt(maxBytes), `${label} exceeds its byte limit.`);
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(
      opened.isFile() && opened.dev === before.dev && opened.ino === before.ino,
      `${label} changed while it was opened.`,
    );
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      requireValue(total <= maxBytes, `${label} exceeds its byte limit.`);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    requireValue(
      after.dev === opened.dev && after.ino === opened.ino && after.size === opened.size,
      `${label} changed while it was read.`,
    );
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

function exactKeys(value, expected, label) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  requireValue(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} keys drifted.`,
  );
}

export async function readHistoricalRpcWorkerFixture() {
  const manifestBytes = await readBoundedRegular(
    manifestPath,
    MAX_MANIFEST_BYTES,
    "RPC Worker historical manifest",
  );
  const manifestText = manifestBytes.toString("utf8");
  requireValue(Buffer.from(manifestText, "utf8").equals(manifestBytes), "Historical manifest must be UTF-8.");
  const manifest = JSON.parse(manifestText);
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "format",
      "parts",
      "partLength",
      "base64Length",
      "compressedBytes",
      "compressedSha256",
      "jsonBytes",
      "jsonSha256",
      "outerContractFingerprint",
      "captureContractFingerprint",
      "source",
      "stability",
    ],
    "RPC Worker historical manifest",
  );
  requireValue(manifest.schemaVersion === 1, "Historical manifest schemaVersion must be 1.");
  requireValue(manifest.format === "gzip+base64-parts", "Historical manifest format drifted.");
  requireValue(Array.isArray(manifest.parts) && manifest.parts.length === 1, "Historical manifest must reference one part.");
  requireValue(
    Number.isSafeInteger(manifest.partLength) && manifest.partLength > 0,
    "Historical partLength is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.base64Length) && manifest.base64Length > 0,
    "Historical base64Length is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.compressedBytes) &&
      manifest.compressedBytes > 0 &&
      manifest.compressedBytes <= MAX_COMPRESSED_BYTES,
    "Historical compressedBytes is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.jsonBytes) && manifest.jsonBytes > 0 && manifest.jsonBytes <= MAX_JSON_BYTES,
    "Historical jsonBytes is invalid.",
  );
  for (const field of [
    "compressedSha256",
    "jsonSha256",
    "outerContractFingerprint",
    "captureContractFingerprint",
  ]) {
    requireValue(/^[0-9a-f]{64}$/.test(manifest[field]), `Historical ${field} is invalid.`);
  }

  const partName = manifest.parts[0];
  requireValue(basename(partName) === partName, "Historical part path must be a basename.");
  const partMatch = PART_PATTERN.exec(partName);
  requireValue(Boolean(partMatch) && partMatch[1] === "00", "Historical part name is invalid.");
  const partBytes = await readBoundedRegular(join(fixtureDir, partName), MAX_PART_BYTES, "Historical fixture part");
  requireValue(partBytes.length === manifest.partLength, "Historical part length drifted.");
  requireValue(sha256(partBytes) === partMatch[2], "Historical part content hash differs from its name.");
  const base64 = partBytes.toString("ascii");
  requireValue(Buffer.from(base64, "ascii").equals(partBytes), "Historical part must be ASCII.");
  requireValue(base64.length === manifest.base64Length, "Historical base64 length drifted.");
  requireValue(base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64), "Historical base64 is malformed.");
  const compressed = Buffer.from(base64, "base64");
  requireValue(compressed.length === manifest.compressedBytes, "Historical compressed length drifted.");
  requireValue(sha256(compressed) === manifest.compressedSha256, "Historical compressed hash drifted.");
  const jsonBytes = gunzipSync(compressed, { maxOutputLength: MAX_JSON_BYTES });
  requireValue(jsonBytes.length === manifest.jsonBytes, "Historical JSON length drifted.");
  requireValue(sha256(jsonBytes) === manifest.jsonSha256, "Historical JSON hash drifted.");
  const jsonText = jsonBytes.toString("utf8");
  requireValue(Buffer.from(jsonText, "utf8").equals(jsonBytes), "Historical JSON must be UTF-8.");
  const result = JSON.parse(jsonText);
  requireValue(result.contractFingerprint === manifest.outerContractFingerprint, "Historical outer fingerprint differs from manifest.");
  requireValue(result.contractFingerprint === fingerprint(result), "Historical outer fingerprint is invalid.");
  requireValue(
    result.capture?.contractFingerprint === manifest.captureContractFingerprint,
    "Historical capture fingerprint differs from manifest.",
  );
  requireValue(result.capture?.contractFingerprint === fingerprint(result.capture), "Historical capture fingerprint is invalid.");

  exactKeys(
    manifest.source,
    ["state", "head", "workflowRun", "runAttempt", "artifactId", "artifactDigest"],
    "Historical source",
  );
  requireValue(manifest.source.state === "captured", "Historical source state must be captured.");
  requireValue(/^[0-9a-f]{40}$/.test(manifest.source.head), "Historical source HEAD is invalid.");
  for (const key of ["workflowRun", "runAttempt", "artifactId"]) {
    requireValue(Number.isSafeInteger(manifest.source[key]) && manifest.source[key] > 0, `Historical source ${key} is invalid.`);
  }
  requireValue(/^sha256:[0-9a-f]{64}$/.test(manifest.source.artifactDigest), "Historical Artifact digest is invalid.");
  exactKeys(
    manifest.stability,
    [
      "comparisonArtifactId",
      "comparisonArtifactDigest",
      "artifactResultJsonBytes",
      "artifactResultJsonSha256",
      "byteIdenticalAcrossAttempts",
    ],
    "Historical stability",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.comparisonArtifactId) &&
      manifest.stability.comparisonArtifactId > 0 &&
      manifest.stability.comparisonArtifactId !== manifest.source.artifactId,
    "Historical comparison Artifact ID is invalid.",
  );
  requireValue(
    /^sha256:[0-9a-f]{64}$/.test(manifest.stability.comparisonArtifactDigest),
    "Historical comparison Artifact digest is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.artifactResultJsonBytes) &&
      manifest.stability.artifactResultJsonBytes > 0,
    "Historical Artifact JSON byte count is invalid.",
  );
  requireValue(
    /^[0-9a-f]{64}$/.test(manifest.stability.artifactResultJsonSha256),
    "Historical Artifact JSON hash is invalid.",
  );
  requireValue(manifest.stability.byteIdenticalAcrossAttempts === true, "Historical captures must be byte-identical.");
  return { manifest, jsonBytes, result };
}

function runLegacyChecker(path) {
  const checked = spawnSync(process.execPath, [checkerPath, "--rpc-worker-lifecycle", path], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) {
    throw new Error(
      `Historical RPC Worker checker failed (${checked.status}): ${(checked.stderr || checked.stdout || "").trim()}`,
    );
  }
  process.stdout.write(checked.stdout);
}

export async function withHistoricalRpcWorkerFixture(callback) {
  const fixture = await readHistoricalRpcWorkerFixture();
  const tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-base-fixture-"));
  const path = join(tempRoot, "result.json");
  try {
    await writeFile(path, fixture.jsonBytes, { flag: "wx", mode: 0o600 });
    return await callback({ ...fixture, path });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const verifyOnly = args.includes("--verify-only");
  requireValue(!(outputIndex >= 0 && verifyOnly), "Choose at most one of --output or --verify-only.");
  if (outputIndex >= 0) {
    const outputPath = args[outputIndex + 1];
    requireValue(Boolean(outputPath), "--output requires a destination path.");
    const { jsonBytes } = await readHistoricalRpcWorkerFixture();
    await writeFile(resolve(outputPath), jsonBytes, { flag: "wx", mode: 0o600 });
    console.log(`Materialized historical RPC Worker Fixture at ${resolve(outputPath)}.`);
    return;
  }
  if (verifyOnly) {
    const { manifest } = await readHistoricalRpcWorkerFixture();
    console.log(`Historical RPC Worker Fixture content: OK (${manifest.outerContractFingerprint}).`);
    return;
  }
  await withHistoricalRpcWorkerFixture(async ({ path, manifest }) => {
    runLegacyChecker(path);
    console.log(`Historical RPC Worker committed Fixture: OK (${manifest.outerContractFingerprint}).`);
  });
}

const isDirectExecution =
  typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(`Historical RPC Worker Fixture validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
