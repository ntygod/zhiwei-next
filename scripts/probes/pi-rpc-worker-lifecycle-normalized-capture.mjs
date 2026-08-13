import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawCapturePath = fileURLToPath(
  new URL("./pi-sdk-rpc-parity-faux-extension.mjs", import.meta.url),
);
const outputPath = resolveRequiredPath("PI_LIFECYCLE_OUTPUT");

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableResult(value) {
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function fingerprint(value) {
  return sha256(stableResult(value));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
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

function normalizeWorkerCase(caseResult) {
  const worker = caseResult?.worker;
  if (!worker || !Array.isArray(worker.transcript)) return undefined;

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
      new Set(["exit", "close"]).has(record.event),
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

  return sequenceMap;
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
    "Raw capture scenario must be rpc-worker-lifecycle.",
  );

  const cases = capture.cases ?? {};
  for (const caseResult of Object.values(cases)) {
    normalizeWorkerCase(caseResult);
  }

  const normalWorker = cases.normalPromptEof?.worker;
  const parseResponseSequence = findResponseSequence(
    normalWorker,
    null,
    "parse",
  );
  const unknownResponseSequence = findResponseSequence(
    normalWorker,
    "normal-unicode-unknown",
  );
  requireValue(
    Number.isInteger(parseResponseSequence) &&
      Number.isInteger(unknownResponseSequence),
    "Normalized protocol error response sequences are missing.",
  );
  cases.protocolErrors.malformedJson.responseSequence =
    parseResponseSequence;
  cases.protocolErrors.unknownCommand.responseSequence =
    unknownResponseSequence;

  capture.contract.sequenceDomains = {
    workerTranscript: "worker-output-and-process-boundaries",
    clientActions: "host-local-actions",
    crossDomainTotalOrder: false,
  };

  delete capture.contractFingerprint;
  capture.contractFingerprint = fingerprint(capture);
  delete result.contractFingerprint;
  result.contractFingerprint = fingerprint(result);
  return result;
}

const child = spawnSync(process.execPath, [rawCapturePath], {
  cwd: process.cwd(),
  env: process.env,
  encoding: "utf8",
  timeout: 240_000,
  maxBuffer: 16 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});

if (child.error) throw child.error;
if (child.status !== 0) {
  const diagnostic = (child.stderr || child.stdout || "").trim();
  throw new Error(
    `Raw RPC Worker capture exited ${child.status}: ${diagnostic}`,
  );
}

const raw = JSON.parse(await readFile(outputPath, "utf8"));
const normalized = normalizeResult(raw);
await writeFile(
  outputPath,
  `${JSON.stringify(normalized, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(normalized)}\n`);
