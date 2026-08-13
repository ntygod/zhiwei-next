import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const legacyChecker = join(
  repositoryRoot,
  "scripts/check-pi-sdk-rpc-client-messages-legacy-result.mjs",
);
const MAX_BYTES = 4 * 1024 * 1024;
const workerMode = process.argv[2] === "--rpc-worker-lifecycle";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprint(value) {
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return sha256(JSON.stringify(clone));
}

function runLegacy(args) {
  const checked = spawnSync(process.execPath, [legacyChecker, ...args], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: MAX_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) {
    fail(
      `Legacy SDK/RPC messages checker failed (${checked.status}): ${(
        checked.stderr || checked.stdout || ""
      ).trim()}`,
    );
  }
  process.stdout.write(checked.stdout);
}

function contiguous(records) {
  return records.every(
    (record, index) => record?.sequence === index + 1,
  );
}

function responseRecords(caseResult, id, command) {
  return (caseResult?.worker?.transcript ?? []).filter(
    (record) =>
      record.kind === "response" &&
      record.id === id &&
      record.command === command,
  );
}

function eventSequence(caseResult, type, predicate = () => true) {
  return (caseResult?.worker?.transcript ?? []).find(
    (record) =>
      record.kind === "event" &&
      record.event?.type === type &&
      predicate(record.event),
  )?.sequence;
}

function stableWorkerViolations(result) {
  const violations = [];
  const capture = result?.capture;
  const cases = capture?.cases ?? {};
  const providerError = cases.acceptedProviderError;
  const expectedDomains = {
    workerTranscript: "worker-output-and-process-boundaries",
    clientActions: "host-local-actions",
    crossDomainTotalOrder: false,
    raceSensitiveSnapshots: "bounded-validation-then-excluded",
  };

  if (result?.contractFingerprint !== fingerprint(result)) {
    violations.push("Outer RPC Worker fingerprint is invalid.");
  }
  if (capture?.contractFingerprint !== fingerprint(capture)) {
    violations.push("Nested RPC Worker fingerprint is invalid.");
  }
  if (
    result?.status !== "passed" ||
    result?.scenario !== "rpc-worker-lifecycle" ||
    capture?.status !== "passed" ||
    capture?.scenario !== "rpc-worker-lifecycle"
  ) {
    violations.push("RPC Worker result status or scenario drifted.");
  }
  if (
    JSON.stringify(capture?.contract?.sequenceDomains) !==
    JSON.stringify(expectedDomains)
  ) {
    violations.push("RPC Worker sequence-domain contract drifted.");
  }

  for (const [name, caseResult] of Object.entries({
    normalPromptEof: cases.normalPromptEof,
    restartResumeSigterm: cases.restartResumeSigterm,
    preflightRejection: cases.preflightRejection,
    acceptedProviderError: providerError,
  })) {
    const transcript = caseResult?.worker?.transcript ?? [];
    const clientActions = caseResult?.worker?.clientActions ?? [];
    if (!contiguous(transcript)) {
      violations.push(`${name} Worker transcript sequence drifted.`);
    }
    if (!contiguous(clientActions)) {
      violations.push(`${name} host action sequence drifted.`);
    }
    if (transcript.some((record) => record.kind === "client")) {
      violations.push(`${name} mixed Host actions into the Worker transcript.`);
    }
  }

  const expectedProbe = {
    command: "get_state",
    requestId: "provider-error-state-during",
    responseObserved: true,
    allowedObservedPhases: ["running", "settled"],
    excludedFromFrozenFixture: true,
    reason: "provider-error-completion-races-state-response",
  };
  if (
    JSON.stringify(providerError?.acceptanceStateProbe) !==
    JSON.stringify(expectedProbe)
  ) {
    violations.push("Provider-error State probe disclosure drifted.");
  }
  if (Object.hasOwn(providerError ?? {}, "stateDuring")) {
    violations.push("Provider-error Fixture retained the race-sensitive State snapshot.");
  }
  if (
    Object.hasOwn(
      providerError?.ordering ?? {},
      "stateDuringResponseSequence",
    ) ||
    Object.hasOwn(
      providerError?.ordering ?? {},
      "stateDuringAfterAcceptanceBeforeSettled",
    )
  ) {
    violations.push("Provider-error ordering retained race-sensitive State fields.");
  }
  if (
    responseRecords(
      providerError,
      "provider-error-state-during",
      "get_state",
    ).length !== 0
  ) {
    violations.push("Provider-error Worker transcript retained the State probe response.");
  }
  if (
    !(providerError?.worker?.clientActions ?? []).some(
      (action) =>
        action.action === "send" &&
        action.id === "provider-error-state-during" &&
        action.command === "get_state",
    )
  ) {
    violations.push("Provider-error Host State probe action is missing.");
  }

  const ordering = providerError?.ordering ?? {};
  const chain = [
    ordering.promptResponseSequence,
    ordering.agentStartSequence,
    ordering.assistantErrorMessageEndSequence,
    ordering.agentEndSequence,
    ordering.agentSettledSequence,
  ];
  if (
    ordering.promptResponsePrecedesAgentStart !== true ||
    ordering.failureExpressedAfterAcceptance !== true ||
    !chain.every(
      (value, index) =>
        Number.isInteger(value) &&
        (index === 0 || value > chain[index - 1]),
    )
  ) {
    violations.push("Provider-error stable acceptance/failure chain drifted.");
  }
  if (
    eventSequence(providerError, "agent_start") === undefined ||
    eventSequence(
      providerError,
      "agent_end",
      (event) => event.willRetry === false,
    ) === undefined ||
    eventSequence(providerError, "agent_settled") === undefined
  ) {
    violations.push("Provider-error stable Agent lifecycle is incomplete.");
  }
  if (
    providerError?.finalState?.isStreaming !== false ||
    providerError?.finalState?.messageCount !== 2 ||
    providerError?.finalMessages?.[1]?.stopReason !== "error" ||
    providerError?.finalMessages?.[1]?.errorMessage !==
      "ZHIWEI_RPC_FIXED_PROVIDER_ERROR"
  ) {
    violations.push("Provider-error final State or Assistant error Message drifted.");
  }
  return violations;
}

async function readBounded(path) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("RPC Worker evidence must be a regular file.");
  }
  if (before.size > BigInt(MAX_BYTES)) {
    throw new Error("RPC Worker evidence exceeds its byte limit.");
  }
  return readFile(path, "utf8");
}

async function runWorkerChecker(path) {
  const result = JSON.parse(await readBounded(path));
  const violations = stableWorkerViolations(result);
  if (violations.length > 0) {
    fail(
      "Pi RPC Worker normalized result violations:\n" +
        violations.map((item) => `- ${item}`).join("\n"),
    );
  }

  const projected = structuredClone(result);
  const providerError = projected.capture.cases.acceptedProviderError;
  providerError.stateDuring = structuredClone(providerError.finalState);
  providerError.stateDuring.isStreaming = true;
  providerError.stateDuring.messageCount = 1;
  providerError.ordering.stateDuringAfterAcceptanceBeforeSettled = true;
  delete projected.capture.contractFingerprint;
  projected.capture.contractFingerprint = fingerprint(projected.capture);
  delete projected.contractFingerprint;
  projected.contractFingerprint = fingerprint(projected);

  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "zhiwei-rpc-worker-legacy-check-"),
  );
  const projectedPath = join(temporaryRoot, "result.json");
  try {
    await writeFile(
      projectedPath,
      `${JSON.stringify(projected, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    runLegacy(["--rpc-worker-lifecycle", projectedPath]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  console.log(
    `Pi RPC Worker normalized boundaries: OK (${result.capture.contractFingerprint})`,
  );
}

if (!workerMode) {
  runLegacy(process.argv.slice(2));
} else {
  const path = resolve(
    process.argv[3] ??
      process.env.PI_RPC_WORKER_LIFECYCLE_OUTPUT ??
      "",
  );
  if (!process.argv[3] && !process.env.PI_RPC_WORKER_LIFECYCLE_OUTPUT) {
    fail("RPC Worker lifecycle evidence path is required.");
  }
  await runWorkerChecker(path);
}
