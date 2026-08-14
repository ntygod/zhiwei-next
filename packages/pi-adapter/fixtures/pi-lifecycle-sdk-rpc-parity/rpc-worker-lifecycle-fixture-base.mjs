import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertProviderErrorNormalizationMutationTests,
  normalizeRpcWorkerResult,
} from "./rpc-worker-lifecycle-normalizer.mjs";
import { readHistoricalRpcWorkerFixture } from "./rpc-worker-lifecycle-base-fixture.mjs";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDir, "../../../../");
export const RPC_WORKER_V2_MANIFEST_PATH = join(
  fixtureDir,
  "rpc-worker-lifecycle-manifest-v2.json",
);
const checkerPath = join(
  repositoryRoot,
  "scripts/check-pi-sdk-rpc-client-messages-result.mjs",
);
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_REPLACEMENT_BYTES = 512 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value) {
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return sha256(JSON.stringify(clone));
}

async function readBoundedRegular(path, maximumBytes, label) {
  const before = await lstat(path, { bigint: true });
  requireValue(before.isFile() && !before.isSymbolicLink(), `${label} must be a regular file.`);
  requireValue(before.size <= BigInt(maximumBytes), `${label} exceeds its byte limit.`);
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
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      requireValue(total <= maximumBytes, `${label} exceeds its byte limit.`);
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

function parseUtf8Json(bytes, label) {
  const text = bytes.toString("utf8");
  requireValue(Buffer.from(text, "utf8").equals(bytes), `${label} must be valid UTF-8.`);
  return JSON.parse(text);
}

function exactKeys(value, expected, label) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  requireValue(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} keys drifted.`,
  );
}

function validateManifest(manifest) {
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "format",
      "baseManifest",
      "replacement",
      "replacementSha256",
      "jsonBytes",
      "jsonSha256",
      "outerContractFingerprint",
      "captureContractFingerprint",
      "source",
      "stability",
    ],
    "RPC Worker v2 manifest",
  );
  requireValue(manifest.schemaVersion === 2, "RPC Worker v2 manifest schemaVersion must be 2.");
  requireValue(
    manifest.format === "gzip-plus-readable-case-replacement",
    "RPC Worker v2 manifest format drifted.",
  );
  for (const field of ["baseManifest", "replacement"]) {
    requireValue(
      typeof manifest[field] === "string" &&
        manifest[field].length > 0 &&
        basename(manifest[field]) === manifest[field],
      `RPC Worker v2 ${field} must be a basename.`,
    );
  }
  requireValue(
    manifest.baseManifest === "rpc-worker-lifecycle-manifest.json",
    "RPC Worker v2 baseManifest drifted.",
  );
  requireValue(
    manifest.replacement === "rpc-worker-lifecycle-provider-error-replacement.json",
    "RPC Worker v2 replacement drifted.",
  );
  for (const field of [
    "replacementSha256",
    "jsonSha256",
    "outerContractFingerprint",
    "captureContractFingerprint",
  ]) {
    requireValue(SHA256_PATTERN.test(manifest[field]), `RPC Worker v2 ${field} is invalid.`);
  }
  requireValue(
    Number.isSafeInteger(manifest.jsonBytes) && manifest.jsonBytes > 0 && manifest.jsonBytes <= MAX_JSON_BYTES,
    "RPC Worker v2 jsonBytes is invalid.",
  );

  exactKeys(
    manifest.source,
    ["state", "head", "workflowRun", "runAttempt", "artifactId", "artifactDigest"],
    "RPC Worker v2 source",
  );
  requireValue(manifest.source.state === "captured", "RPC Worker v2 source state must be captured.");
  requireValue(/^[0-9a-f]{40}$/.test(manifest.source.head), "RPC Worker v2 source HEAD is invalid.");
  for (const field of ["workflowRun", "runAttempt", "artifactId"]) {
    requireValue(Number.isSafeInteger(manifest.source[field]) && manifest.source[field] > 0, `RPC Worker v2 source ${field} is invalid.`);
  }
  requireValue(DIGEST_PATTERN.test(manifest.source.artifactDigest), "RPC Worker v2 source Artifact digest is invalid.");

  exactKeys(
    manifest.stability,
    [
      "comparisonRunAttempt",
      "comparisonArtifactId",
      "comparisonArtifactDigest",
      "artifactResultJsonBytes",
      "artifactResultJsonSha256",
      "byteIdenticalAcrossAttempts",
    ],
    "RPC Worker v2 stability",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.comparisonRunAttempt) &&
      manifest.stability.comparisonRunAttempt > 0 &&
      manifest.stability.comparisonRunAttempt !== manifest.source.runAttempt,
    "RPC Worker v2 comparison run attempt is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.comparisonArtifactId) &&
      manifest.stability.comparisonArtifactId > 0 &&
      manifest.stability.comparisonArtifactId !== manifest.source.artifactId,
    "RPC Worker v2 comparison Artifact ID is invalid.",
  );
  requireValue(
    DIGEST_PATTERN.test(manifest.stability.comparisonArtifactDigest),
    "RPC Worker v2 comparison Artifact digest is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.artifactResultJsonBytes) &&
      manifest.stability.artifactResultJsonBytes > 0,
    "RPC Worker v2 source result byte count is invalid.",
  );
  requireValue(
    SHA256_PATTERN.test(manifest.stability.artifactResultJsonSha256),
    "RPC Worker v2 source result hash is invalid.",
  );
  requireValue(
    manifest.stability.byteIdenticalAcrossAttempts === true,
    "RPC Worker v2 source attempts must be byte-identical.",
  );
}


const MAX_REPOSITORY_DOCUMENT_BYTES = 512 * 1024;

async function readRepositoryText(relativePath, label) {
  const bytes = await readBoundedRegular(
    join(repositoryRoot, relativePath),
    MAX_REPOSITORY_DOCUMENT_BYTES,
    label,
  );
  const text = bytes.toString("utf8");
  requireValue(Buffer.from(text, "utf8").equals(bytes), `${label} must be valid UTF-8.`);
  return text;
}

function requireTokens(text, tokens, label) {
  for (const token of tokens) {
    requireValue(text.includes(token), `${label} is missing integration token: ${token}`);
  }
}

async function validateRepositoryIntegration(manifest) {
  const [workflow, ci, packageText, fixtureDoc, architectureDoc, integrationDoc, spikeDoc, projectState] =
    await Promise.all([
      readRepositoryText(".github/workflows/pi-sdk-rpc-parity.yml", "SDK/RPC Workflow"),
      readRepositoryText(".github/workflows/ci.yml", "CI Workflow"),
      readRepositoryText("package.json", "package.json"),
      readRepositoryText(
        "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle.md",
        "RPC Worker Fixture document",
      ),
      readRepositoryText(
        "docs/architecture/pi-rpc-worker-lifecycle.md",
        "RPC Worker architecture document",
      ),
      readRepositoryText("docs/architecture/pi-integration.md", "Pi integration document"),
      readRepositoryText("docs/spikes/pi-runtime-contract/README.md", "Pi Runtime Spike index"),
      readRepositoryText("docs/harness/project-state.md", "project state"),
    ]);

  const fixtureGlob = "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/**";
  requireValue(
    workflow.split(fixtureGlob).length >= 3 && ci.includes(fixtureGlob),
    "Relocated RPC Worker checkers are not covered by both standalone and required-evidence path gates.",
  );
  requireTokens(
    workflow,
    [
      "pi-sdk-rpc-parity-fixture.mjs",
      "rpc-worker-lifecycle-capture-base.mjs",
      "rpc-worker-lifecycle-jsonl-reader.mjs",
      "rpc-worker-lifecycle-jsonl-reader.test.mjs",
      "rpc-worker-lifecycle-normalizer.mjs",
      "rpc-worker-lifecycle-normalizer.test.mjs",
      "rpc-worker-lifecycle-legacy-checker.mjs",
      "rpc-worker-lifecycle-legacy-checker-base.mjs",
      "rpc-worker-lifecycle-provenance.mjs",
      "rpc-worker-lifecycle-provenance.test.mjs",
      "node --check packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs",
      "- pi-sdk-rpc-parity-probe\n      - pi-rpc-worker-lifecycle-probe",
    ],
    "SDK/RPC Workflow",
  );
  requireTokens(
    packageText,
    [
      "rpc-worker-lifecycle-jsonl-reader.test.mjs",
      "pi-sdk-rpc-parity-faux-extension.mjs --verify-transform",
      "rpc-worker-lifecycle-normalizer.test.mjs",
      "rpc-worker-lifecycle-provenance.test.mjs",
      "check-pi-sdk-rpc-parity-provenance.mjs --verify-base",
      "rpc-worker-lifecycle-legacy-checker.mjs --verify-transform",
    ],
    "package.json",
  );
  requireValue(
    !existsSync(join(repositoryRoot, "scripts/check-pi-sdk-rpc-client-messages-legacy-result.mjs")),
    "The uncovered legacy Checker path must be removed after relocation under the Fixture path gate.",
  );
  requireValue(
    !existsSync(join(repositoryRoot, "scripts/check-pi-sdk-rpc-parity-provenance-base.mjs")),
    "The immutable SDK/RPC provenance base must live under the Fixture path gate.",
  );

  const currentIdentityTokens = [
    "rpc-worker-lifecycle-manifest-v2.json",
    manifest.stability.comparisonArtifactDigest,
    manifest.stability.artifactResultJsonSha256,
    manifest.outerContractFingerprint,
    manifest.captureContractFingerprint,
  ];
  requireTokens(fixtureDoc, currentIdentityTokens, "RPC Worker Fixture document");
  requireTokens(
    fixtureDoc,
    [
      "comparison run attempt       1",
      "complete running/settled State variants",
      "empty LF record",
      "CRLF",
      "live provenance",
      "historical compare step failed",
    ],
    "RPC Worker Fixture document",
  );
  requireTokens(
    architectureDoc,
    [
      "strict byte reader",
      "complete State object",
      "crossDomainTotalOrder  false",
      "historical compare step failed",
      manifest.stability.comparisonArtifactDigest,
    ],
    "RPC Worker architecture document",
  );
  requireTokens(
    integrationDoc,
    [
      "strict byte LF reader",
      "complete running/settled State object",
      "live provenance",
      "crossDomainTotalOrder  false",
    ],
    "Pi integration document",
  );
  requireTokens(
    spikeDoc,
    [
      "## RPC Worker schema v2 当前合同",
      "## RPC Worker schema v1 历史来源",
      "rpc-worker-lifecycle-manifest-v2.json",
      "rpc-worker-lifecycle-provider-error-replacement.json",
      "rpc-worker-lifecycle-normalizer.mjs",
      "rpc-worker-lifecycle-provenance.mjs",
      "crossDomainTotalOrder  false",
      manifest.stability.comparisonArtifactDigest,
    ],
    "Pi Runtime Spike index",
  );
  requireTokens(
    projectState,
    [
      "完整 running / settled State object",
      "strict byte LF reader",
      "Worker v2 live provenance",
      manifest.stability.comparisonArtifactDigest,
    ],
    "project state",
  );
}

export async function readRpcWorkerV2Fixture(
  manifestPath = RPC_WORKER_V2_MANIFEST_PATH,
) {
  const manifestBytes = await readBoundedRegular(
    resolve(manifestPath),
    MAX_MANIFEST_BYTES,
    "RPC Worker v2 manifest",
  );
  const manifest = parseUtf8Json(manifestBytes, "RPC Worker v2 manifest");
  validateManifest(manifest);

  await validateRepositoryIntegration(manifest);
  const historical = await readHistoricalRpcWorkerFixture();
  requireValue(
    basename(manifest.baseManifest) === basename("rpc-worker-lifecycle-manifest.json"),
    "RPC Worker v2 historical manifest name drifted.",
  );
  const replacementPath = join(fixtureDir, manifest.replacement);
  const replacementBytes = await readBoundedRegular(
    replacementPath,
    MAX_REPLACEMENT_BYTES,
    "RPC Worker v2 Provider-error replacement",
  );
  requireValue(
    sha256(replacementBytes) === manifest.replacementSha256,
    "RPC Worker v2 Provider-error replacement hash drifted.",
  );
  const replacement = parseUtf8Json(
    replacementBytes,
    "RPC Worker v2 Provider-error replacement",
  );
  exactKeys(
    replacement,
    [
      "schemaVersion",
      "baseOuterContractFingerprint",
      "baseCaptureContractFingerprint",
      "caseName",
      "replacement",
    ],
    "RPC Worker v2 Provider-error replacement",
  );
  requireValue(replacement.schemaVersion === 1, "Provider-error replacement schemaVersion must be 1.");
  requireValue(replacement.caseName === "acceptedProviderError", "Provider-error replacement caseName drifted.");
  requireValue(
    replacement.baseOuterContractFingerprint === historical.manifest.outerContractFingerprint &&
      replacement.baseCaptureContractFingerprint === historical.manifest.captureContractFingerprint,
    "Provider-error replacement is not bound to the historical base Fixture.",
  );

  assertProviderErrorNormalizationMutationTests(replacement.replacement);
  const raw = structuredClone(historical.result);
  raw.capture.cases.acceptedProviderError = structuredClone(replacement.replacement);
  const result = normalizeRpcWorkerResult(raw);
  const jsonBytes = Buffer.from(JSON.stringify(result), "utf8");
  requireValue(jsonBytes.length === manifest.jsonBytes, "RPC Worker v2 canonical JSON byte length drifted.");
  requireValue(sha256(jsonBytes) === manifest.jsonSha256, "RPC Worker v2 canonical JSON hash drifted.");
  requireValue(
    result.contractFingerprint === manifest.outerContractFingerprint &&
      result.contractFingerprint === fingerprint(result),
    "RPC Worker v2 outer contract fingerprint drifted.",
  );
  requireValue(
    result.capture?.contractFingerprint === manifest.captureContractFingerprint &&
      result.capture.contractFingerprint === fingerprint(result.capture),
    "RPC Worker v2 capture contract fingerprint drifted.",
  );
  return { manifest, replacement, result, jsonBytes };
}

function runRuntimeChecker(path) {
  const checked = spawnSync(
    process.execPath,
    [checkerPath, "--rpc-worker-lifecycle", path],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (checked.error) throw checked.error;
  if (checked.status !== 0) {
    throw new Error(
      `RPC Worker v2 checker failed (${checked.status}): ${(checked.stderr || checked.stdout || "").trim()}`,
    );
  }
  process.stdout.write(checked.stdout);
}

export async function withRpcWorkerV2Fixture(callback) {
  const fixture = await readRpcWorkerV2Fixture();
  const tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-v2-fixture-"));
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
  const compareIndex = args.indexOf("--compare");
  const outputIndex = args.indexOf("--output");
  const verifyOnly = args.includes("--verify-only");
  requireValue(
    [compareIndex >= 0, outputIndex >= 0, verifyOnly].filter(Boolean).length <= 1,
    "Choose at most one of --compare, --output, or --verify-only.",
  );
  if (compareIndex >= 0) {
    const freshPath = args[compareIndex + 1];
    requireValue(Boolean(freshPath), "--compare requires a fresh result path.");
    await withRpcWorkerV2Fixture(async ({ path, result, manifest }) => {
      runRuntimeChecker(path);
      runRuntimeChecker(resolve(freshPath));
      const freshBytes = await readBoundedRegular(
        resolve(freshPath),
        MAX_JSON_BYTES,
        "Fresh RPC Worker v2 result",
      );
      const fresh = parseUtf8Json(freshBytes, "Fresh RPC Worker v2 result");
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
    const { jsonBytes } = await readRpcWorkerV2Fixture();
    await writeFile(resolve(outputPath), jsonBytes, { flag: "wx", mode: 0o600 });
    console.log(`Materialized RPC Worker v2 Fixture at ${resolve(outputPath)}.`);
    return;
  }
  if (verifyOnly) {
    const { manifest } = await readRpcWorkerV2Fixture();
    console.log(`RPC Worker v2 Fixture content: OK (${manifest.outerContractFingerprint}).`);
    return;
  }
  await withRpcWorkerV2Fixture(async ({ path, manifest }) => {
    runRuntimeChecker(path);
    console.log(`RPC Worker v2 committed Fixture: OK (${manifest.outerContractFingerprint}).`);
  });
}

const isDirectExecution =
  typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(`RPC Worker v2 Fixture validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
