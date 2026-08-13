import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDir, "../../../../");
const manifestPath = join(fixtureDir, "rpc-worker-lifecycle-manifest-v2.json");
const baseLoaderPath = join(fixtureDir, "rpc-worker-lifecycle-base-fixture.mjs");
const checkerPath = join(
  repositoryRoot,
  "scripts/check-pi-sdk-rpc-client-messages-result.mjs",
);
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;

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
function exactKeys(value, expected, label) {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object.`,
  );
  requireValue(
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort()),
    `${label} keys drifted.`,
  );
}

async function readBoundedRegular(path, maximumBytes, label) {
  const before = await lstat(path, { bigint: true });
  requireValue(
    before.isFile() && !before.isSymbolicLink(),
    `${label} must be a regular file.`,
  );
  requireValue(
    before.size <= BigInt(maximumBytes),
    `${label} exceeds its byte limit.`,
  );
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(
      opened.isFile() &&
        opened.dev === before.dev &&
        opened.ino === before.ino &&
        opened.size <= BigInt(maximumBytes),
      `${label} changed while it was opened.`,
    );
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(
        Math.min(64 * 1024, maximumBytes + 1 - total),
      );
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      requireValue(total <= maximumBytes, `${label} exceeds its byte limit.`);
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    requireValue(
      after.dev === opened.dev &&
        after.ino === opened.ino &&
        after.size === opened.size,
      `${label} changed while it was read.`,
    );
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}
function parseUtf8Json(bytes, label) {
  const text = bytes.toString("utf8");
  requireValue(
    Buffer.from(text, "utf8").equals(bytes),
    `${label} must be UTF-8.`,
  );
  return JSON.parse(text);
}
function runNode(path, args) {
  const result = spawnSync(process.execPath, [path, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: MAX_JSON_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  requireValue(
    result.status === 0,
    `${basename(path)} failed (${result.status}): ${(
      result.stderr || result.stdout || ""
    ).trim()}`,
  );
  return result.stdout;
}

function validateProvenance(manifest) {
  exactKeys(
    manifest.source,
    [
      "state",
      "head",
      "workflowRun",
      "runAttempt",
      "artifactId",
      "artifactDigest",
    ],
    "RPC Worker v2 source",
  );
  requireValue(manifest.source.state === "captured", "Source state drifted.");
  requireValue(/^[0-9a-f]{40}$/.test(manifest.source.head), "Source HEAD is invalid.");
  for (const key of ["workflowRun", "runAttempt", "artifactId"]) {
    requireValue(
      Number.isSafeInteger(manifest.source[key]) && manifest.source[key] > 0,
      `Source ${key} is invalid.`,
    );
  }
  requireValue(
    /^sha256:[0-9a-f]{64}$/.test(manifest.source.artifactDigest),
    "Source Artifact digest is invalid.",
  );
  exactKeys(
    manifest.stability,
    [
      "comparisonArtifactId",
      "comparisonArtifactDigest",
      "artifactResultJsonBytes",
      "artifactResultJsonSha256",
      "byteIdenticalAcrossAttempts",
    ],
    "RPC Worker v2 stability",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.comparisonArtifactId) &&
      manifest.stability.comparisonArtifactId > 0 &&
      manifest.stability.comparisonArtifactId !== manifest.source.artifactId,
    "Comparison Artifact ID is invalid.",
  );
  requireValue(
    /^sha256:[0-9a-f]{64}$/.test(
      manifest.stability.comparisonArtifactDigest,
    ),
    "Comparison Artifact digest is invalid.",
  );
  requireValue(
    Number.isSafeInteger(manifest.stability.artifactResultJsonBytes) &&
      manifest.stability.artifactResultJsonBytes > 0 &&
      /^[0-9a-f]{64}$/.test(
        manifest.stability.artifactResultJsonSha256,
      ) &&
      manifest.stability.byteIdenticalAcrossAttempts === true,
    "Repeated Artifact identity is invalid.",
  );
}

function remapSequenceFields(value, sequenceMap) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, fieldValue] of Object.entries(value)) {
    if (
      key.endsWith("Sequence") &&
      Number.isInteger(fieldValue) &&
      sequenceMap.has(fieldValue)
    ) {
      value[key] = sequenceMap.get(fieldValue);
    }
  }
}

function normalizeProviderErrorStateRace(caseResult) {
  const transcript = caseResult?.worker?.transcript;
  requireValue(
    Array.isArray(transcript),
    "Provider-error Worker transcript is missing.",
  );
  const stateResponses = transcript.filter(
    (record) =>
      record?.kind === "response" &&
      record.id === "provider-error-state-during" &&
      record.command === "get_state",
  );
  requireValue(
    stateResponses.length === 1 && stateResponses[0].success === true,
    "Provider-error State probe must produce one successful response.",
  );
  const observed = stateResponses[0].data;
  requireValue(
    (observed?.isStreaming === true && observed?.messageCount === 1) ||
      (observed?.isStreaming === false && observed?.messageCount === 2),
    "Provider-error State probe escaped the bounded running/settled race.",
  );
  caseResult.worker.transcript = transcript.filter(
    (record) => record !== stateResponses[0],
  );
  delete caseResult.stateDuring;
  if (caseResult.ordering) {
    delete caseResult.ordering.stateDuringResponseSequence;
    delete caseResult.ordering.stateDuringAfterAcceptanceBeforeSettled;
  }
  caseResult.acceptanceStateProbe = {
    command: "get_state",
    requestId: "provider-error-state-during",
    responseObserved: true,
    allowedObservedPhases: ["running", "settled"],
    excludedFromFrozenFixture: true,
    reason: "provider-error-completion-races-state-response",
  };
}

function normalizeWorkerCase(caseResult) {
  const worker = caseResult?.worker;
  if (!worker || !Array.isArray(worker.transcript)) return;
  const clientActions = [];
  const transcript = [];
  const sequenceMap = new Map();

  for (const sourceRecord of worker.transcript) {
    if (sourceRecord?.kind === "client") {
      const {
        sequence: _sourceSequence,
        kind: _sourceKind,
        ...action
      } = sourceRecord;
      clientActions.push({
        sequence: clientActions.length + 1,
        ...action,
      });
      continue;
    }
    const record = structuredClone(sourceRecord);
    const sourceSequence = record.sequence;
    record.sequence = transcript.length + 1;
    if (Number.isInteger(sourceSequence)) {
      sequenceMap.set(sourceSequence, record.sequence);
    }
    transcript.push(record);
  }

  worker.transcript = transcript;
  worker.processBoundaries = transcript.filter(
    (record) =>
      record.kind === "process" &&
      (record.event === "exit" || record.event === "close"),
  );
  const exitIndex = worker.processBoundaries.findIndex(
    (record) => record.event === "exit",
  );
  const closeIndex = worker.processBoundaries.findIndex(
    (record) => record.event === "close",
  );
  worker.exitBeforeClose = exitIndex >= 0 && closeIndex > exitIndex;
  worker.clientActions = clientActions;

  remapSequenceFields(caseResult.ordering, sequenceMap);
  for (const field of ["response", "promptResponse"]) {
    const summary = caseResult[field];
    if (
      summary &&
      Number.isInteger(summary.sequence) &&
      sequenceMap.has(summary.sequence)
    ) {
      summary.sequence = sequenceMap.get(summary.sequence);
    }
  }
}

function findResponseSequence(worker, id, command) {
  return worker?.transcript?.find(
    (record) =>
      record.kind === "response" &&
      record.id === (id ?? null) &&
      (command === undefined || record.command === command),
  )?.sequence;
}

function normalizeResult(result) {
  const capture = result?.capture;
  requireValue(
    capture?.scenario === "rpc-worker-lifecycle",
    "RPC Worker Fixture scenario drifted.",
  );
  const cases = capture.cases ?? {};
  normalizeProviderErrorStateRace(cases.acceptedProviderError);
  for (const caseResult of Object.values(cases)) {
    normalizeWorkerCase(caseResult);
  }
  const normalWorker = cases.normalPromptEof?.worker;
  const parseSequence = findResponseSequence(normalWorker, null, "parse");
  const unknownSequence = findResponseSequence(
    normalWorker,
    "normal-unicode-unknown",
  );
  requireValue(
    Number.isInteger(parseSequence) && Number.isInteger(unknownSequence),
    "Normalized protocol response sequences are missing.",
  );
  cases.protocolErrors.malformedJson.responseSequence = parseSequence;
  cases.protocolErrors.unknownCommand.responseSequence = unknownSequence;
  capture.contract.sequenceDomains = {
    workerTranscript: "worker-output-and-process-boundaries",
    clientActions: "host-local-actions",
    crossDomainTotalOrder: false,
    raceSensitiveSnapshots: "bounded-validation-then-excluded",
  };
  delete capture.contractFingerprint;
  capture.contractFingerprint = fingerprint(capture);
  delete result.contractFingerprint;
  result.contractFingerprint = fingerprint(result);
  return result;
}

async function loadFixture() {
  const manifest = parseUtf8Json(
    await readBoundedRegular(
      manifestPath,
      MAX_METADATA_BYTES,
      "RPC Worker v2 Manifest",
    ),
    "RPC Worker v2 Manifest",
  );
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
    "RPC Worker v2 Manifest",
  );
  requireValue(manifest.schemaVersion === 2, "Manifest schemaVersion drifted.");
  requireValue(
    manifest.format === "gzip-plus-readable-case-replacement",
    "Manifest format drifted.",
  );
  requireValue(
    manifest.baseManifest === "rpc-worker-lifecycle-manifest.json",
    "Base Manifest identity drifted.",
  );
  for (const field of [
    "replacementSha256",
    "jsonSha256",
    "outerContractFingerprint",
    "captureContractFingerprint",
  ]) {
    requireValue(/^[0-9a-f]{64}$/.test(manifest[field]), `${field} is invalid.`);
  }
  requireValue(
    Number.isSafeInteger(manifest.jsonBytes) &&
      manifest.jsonBytes > 0 &&
      manifest.jsonBytes <= MAX_JSON_BYTES,
    "Final JSON byte count is invalid.",
  );
  validateProvenance(manifest);

  requireValue(
    basename(manifest.replacement) === manifest.replacement,
    "Replacement path must be a basename.",
  );
  const replacementBytes = await readBoundedRegular(
    join(fixtureDir, manifest.replacement),
    MAX_METADATA_BYTES,
    "RPC Worker readable Replacement",
  );
  requireValue(
    sha256(replacementBytes) === manifest.replacementSha256,
    "Readable Replacement hash drifted.",
  );
  const replacement = parseUtf8Json(
    replacementBytes,
    "RPC Worker readable Replacement",
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
    "RPC Worker readable Replacement",
  );
  requireValue(replacement.schemaVersion === 1, "Replacement schemaVersion drifted.");
  requireValue(
    replacement.caseName === "acceptedProviderError",
    "Replacement case identity drifted.",
  );

  const tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-base-"));
  const basePath = join(tempRoot, "base.json");
  try {
    runNode(baseLoaderPath, ["--output", basePath]);
    const result = parseUtf8Json(
      await readBoundedRegular(
        basePath,
        MAX_JSON_BYTES,
        "RPC Worker base Fixture",
      ),
      "RPC Worker base Fixture",
    );
    requireValue(
      result.contractFingerprint ===
          replacement.baseOuterContractFingerprint &&
        result.capture?.contractFingerprint ===
          replacement.baseCaptureContractFingerprint,
      "Replacement base identity drifted.",
    );
    requireValue(
      result.capture?.cases?.acceptedProviderError,
      "Base Provider-error case is missing.",
    );
    result.capture.cases.acceptedProviderError = replacement.replacement;
    const normalized = normalizeResult(result);
    const jsonBytes = Buffer.from(JSON.stringify(normalized), "utf8");
    const actual = {
      jsonBytes: jsonBytes.length,
      jsonSha256: sha256(jsonBytes),
      outerContractFingerprint: normalized.contractFingerprint,
      captureContractFingerprint: normalized.capture.contractFingerprint,
    };
    requireValue(
      actual.jsonBytes === manifest.jsonBytes &&
        actual.jsonSha256 === manifest.jsonSha256 &&
        actual.outerContractFingerprint === manifest.outerContractFingerprint &&
        actual.captureContractFingerprint === manifest.captureContractFingerprint,
      `Final normalized identity drifted: ${JSON.stringify(actual)}.`,
    );
    return { manifest, result: normalized, jsonBytes };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

function runRuntimeChecker(path) {
  process.stdout.write(
    runNode(checkerPath, ["--rpc-worker-lifecycle", path]),
  );
}

async function withMaterializedFixture(callback) {
  const fixture = await loadFixture();
  const tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-v2-"));
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
    "Choose at most one Fixture mode.",
  );
  if (compareIndex >= 0) {
    const freshPath = args[compareIndex + 1];
    requireValue(Boolean(freshPath), "--compare requires a fresh result path.");
    await withMaterializedFixture(async ({ path, result }) => {
      runRuntimeChecker(path);
      runRuntimeChecker(resolve(freshPath));
      const fresh = parseUtf8Json(
        await readBoundedRegular(
          resolve(freshPath),
          MAX_JSON_BYTES,
          "Fresh RPC Worker result",
        ),
        "Fresh RPC Worker result",
      );
      requireValue(
        JSON.stringify(fresh) === JSON.stringify(result),
        `Fresh result differs from committed v2 Fixture: committed=${result.contractFingerprint}, fresh=${fresh.contractFingerprint ?? "<missing>"}.`,
      );
    });
    console.log("Fresh RPC Worker result matches the complete committed v2 Fixture object.");
    return;
  }
  if (outputIndex >= 0) {
    const outputPath = args[outputIndex + 1];
    requireValue(Boolean(outputPath), "--output requires a destination path.");
    const { jsonBytes } = await loadFixture();
    await writeFile(resolve(outputPath), jsonBytes, { flag: "wx", mode: 0o600 });
    console.log(`Materialized RPC Worker v2 Fixture at ${resolve(outputPath)}.`);
    return;
  }
  if (verifyOnly) {
    const { manifest } = await loadFixture();
    console.log(`RPC Worker v2 Fixture content: OK (${manifest.outerContractFingerprint}).`);
    return;
  }
  await withMaterializedFixture(async ({ path, manifest }) => {
    runRuntimeChecker(path);
    console.log(`RPC Worker committed v2 Fixture: OK (${manifest.outerContractFingerprint}).`);
  });
}

try {
  await main();
} catch (error) {
  console.error(`RPC Worker v2 Fixture validation failed: ${error.message}`);
  process.exitCode = 1;
}
