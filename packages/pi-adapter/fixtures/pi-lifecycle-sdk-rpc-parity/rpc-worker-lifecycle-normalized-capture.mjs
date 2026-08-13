import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawCapturePath = fileURLToPath(
  new URL(
    "../../../../scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs",
    import.meta.url,
  ),
);
const contractSourcePath = fileURLToPath(
  new URL(
    "../../../../scripts/probes/pi-sdk-rpc-parity-contract.mjs",
    import.meta.url,
  ),
);
const outputPath = resolveRequiredPath("PI_LIFECYCLE_OUTPUT");
const RAW_CAPTURE_TIMEOUT_MS = 150_000;
const MAX_DIAGNOSTIC_BYTES = 256 * 1024;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableResult(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function fingerprint(value) {
  return sha256(stableResult(value));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  requireValue(first >= 0, `Raw capture source is missing ${label}.`);
  requireValue(
    source.indexOf(before, first + before.length) === -1,
    `Raw capture source contains duplicate ${label}.`,
  );
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function materializeStableRawCapture() {
  const [rawSource, contractSource] = await Promise.all([
    readFile(rawCapturePath, "utf8"),
    readFile(contractSourcePath, "utf8"),
  ]);
  let patched = replaceExactlyOnce(
    rawSource,
    `  requireValue(\n    stateDuring.data?.isStreaming === true && stateDuring.data?.messageCount === 1,\n    "Provider-error State after acceptance drifted.",\n  );\n`,
    "",
    "Provider-error race-sensitive State assertion",
  );
  patched = replaceExactlyOnce(
    patched,
    `    ordering.promptResponsePrecedesAgentStart === true &&\n      ordering.failureExpressedAfterAcceptance === true &&\n      ordering.stateDuringAfterAcceptanceBeforeSettled === true,\n`,
    `    ordering.promptResponsePrecedesAgentStart === true &&\n      ordering.failureExpressedAfterAcceptance === true,\n`,
    "Provider-error race-sensitive ordering assertion",
  );

  const sourceRoot = await mkdtemp(
    join(tmpdir(), "zhiwei-rpc-worker-stable-source-"),
  );
  const capturePath = join(
    sourceRoot,
    "pi-sdk-rpc-parity-faux-extension.mjs",
  );
  const contractPath = join(
    sourceRoot,
    "pi-sdk-rpc-parity-contract.mjs",
  );
  await Promise.all([
    writeFile(capturePath, patched, { flag: "wx", mode: 0o400 }),
    writeFile(contractPath, contractSource, { flag: "wx", mode: 0o400 }),
  ]);
  await Promise.all([
    chmod(capturePath, 0o400),
    chmod(contractPath, 0o400),
  ]);
  await chmod(sourceRoot, 0o500);
  return { capturePath, sourceRoot };
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
}

function findResponseSequence(worker, id, command) {
  return worker?.transcript?.find(
    (record) =>
      record.kind === "response" &&
      record.id === (id ?? null) &&
      (command === undefined || record.command === command),
  )?.sequence;
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

function normalizeCapture(capture) {
  requireValue(
    capture?.scenario === "rpc-worker-lifecycle",
    "Raw capture scenario must be rpc-worker-lifecycle.",
  );

  const cases = capture.cases ?? {};
  normalizeProviderErrorStateRace(cases.acceptedProviderError);
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
    raceSensitiveSnapshots: "bounded-validation-then-excluded",
  };

  delete capture.contractFingerprint;
  capture.contractFingerprint = fingerprint(capture);
  return capture;
}

function appendDiagnostic(current, chunk) {
  const combined = Buffer.concat([current, chunk]);
  return combined.length <= MAX_DIAGNOSTIC_BYTES
    ? combined
    : combined.subarray(combined.length - MAX_DIAGNOSTIC_BYTES);
}

async function runRawCapture() {
  const { capturePath, sourceRoot } = await materializeStableRawCapture();
  try {
    const child = spawn(process.execPath, [capturePath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = Buffer.alloc(0);
    child.stderr.on("data", (chunk) => {
      stderr = appendDiagnostic(stderr, chunk);
    });

    return await new Promise((resolveRun, rejectRun) => {
      let settled = false;
      let timer;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };

      timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Preserve the timeout as the primary failure.
        }
        finish(() =>
          rejectRun(
            new Error(
              `Raw RPC Worker capture exceeded ${RAW_CAPTURE_TIMEOUT_MS}ms.`,
            ),
          ),
        );
      }, RAW_CAPTURE_TIMEOUT_MS);
      timer.unref?.();

      child.once("error", (error) => finish(() => rejectRun(error)));
      child.once("close", (code, signal) => {
        finish(() => {
          if (code === 0 && signal === null) {
            resolveRun();
            return;
          }
          const diagnostic = stderr.toString("utf8").trim();
          rejectRun(
            new Error(
              `Raw RPC Worker capture closed with code=${code ?? "null"}, ` +
                `signal=${signal ?? "null"}` +
                (diagnostic ? `: ${diagnostic}` : "."),
            ),
          );
        });
      });
    });
  } finally {
    try {
      await chmod(sourceRoot, 0o700);
    } catch {
      // Best-effort permission restoration before recursive cleanup.
    }
    await rm(sourceRoot, { recursive: true, force: true });
  }
}

await runRawCapture();
const rawCapture = JSON.parse(await readFile(outputPath, "utf8"));
const normalized = normalizeCapture(rawCapture);
await writeFile(
  outputPath,
  `${JSON.stringify(normalized, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(normalized)}\n`);
