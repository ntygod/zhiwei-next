import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

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

function matchingStateResponses(caseResult) {
  return (caseResult?.worker?.transcript ?? []).filter(
    (record) =>
      record.kind === "response" &&
      record.id === "provider-error-state-during" &&
      record.command === "get_state",
  );
}

function eventSequence(caseResult, type) {
  return caseResult?.worker?.transcript?.find(
    (record) => record.kind === "event" && record.event?.type === type,
  )?.sequence;
}

function promptResponseSequence(caseResult) {
  return caseResult?.worker?.transcript?.find(
    (record) =>
      record.kind === "response" &&
      record.id === "provider-error-prompt" &&
      record.command === "prompt" &&
      record.success === true,
  )?.sequence;
}

export function normalizeProviderErrorStateRace(capture) {
  const caseResult = capture?.cases?.acceptedProviderError;
  requireValue(caseResult, "Accepted Provider-error case is missing before normalization.");
  const responses = matchingStateResponses(caseResult);
  requireValue(
    responses.length === 1 && responses[0].success === true,
    "Provider-error State probe must observe exactly one successful Response.",
  );
  const response = responses[0];
  const promptSequence = promptResponseSequence(caseResult);
  const settledSequence = eventSequence(caseResult, "agent_settled");
  requireValue(
    Number.isSafeInteger(promptSequence) && Number.isSafeInteger(settledSequence),
    "Provider-error Prompt acceptance or agent_settled output is missing.",
  );
  requireValue(
    isDeepStrictEqual(caseResult.stateDuring, response.data),
    "Provider-error stateDuring must equal the actual State Response data.",
  );
  requireValue(
    caseResult.ordering?.stateDuringResponseSequence === response.sequence,
    "Provider-error State ordering summary differs from the actual Response sequence.",
  );
  requireValue(
    response.sequence > promptSequence,
    "Provider-error State Response must follow Prompt acceptance.",
  );
  const beforeSettled = response.sequence < settledSequence;
  requireValue(
    caseResult.ordering?.stateDuringAfterAcceptanceBeforeSettled === beforeSettled,
    "Provider-error State ordering boolean differs from the actual Response position.",
  );

  const finalState = caseResult.finalState;
  requireValue(
    finalState && typeof finalState === "object" && !Array.isArray(finalState),
    "Provider-error final State is missing.",
  );
  const runningVariant = structuredClone(finalState);
  runningVariant.isStreaming = true;
  runningVariant.messageCount = 1;
  const phase = isDeepStrictEqual(response.data, runningVariant)
    ? "running"
    : isDeepStrictEqual(response.data, finalState)
      ? "settled"
      : undefined;
  requireValue(
    phase !== undefined,
    "Provider-error State Response is outside the complete running/settled State variants.",
  );
  if (phase === "running") {
    requireValue(
      beforeSettled,
      "A running Provider-error State Response must precede agent_settled output.",
    );
  }

  const responseIndex = caseResult.worker.transcript.indexOf(response);
  requireValue(responseIndex >= 0, "Provider-error State Response is missing from the transcript.");
  caseResult.worker.transcript.splice(responseIndex, 1);
  delete caseResult.stateDuring;
  delete caseResult.ordering.stateDuringResponseSequence;
  delete caseResult.ordering.stateDuringAfterAcceptanceBeforeSettled;
  caseResult.acceptanceStateProbe = {
    command: "get_state",
    requestId: "provider-error-state-during",
    responseObserved: true,
    allowedObservedPhases: ["running", "settled"],
    excludedFromFrozenFixture: true,
    reason: "provider-error-completion-races-state-response",
  };
  return phase;
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
  const workerTranscript = [];
  const sequenceMap = new Map();
  for (const sourceRecord of worker.transcript) {
    if (sourceRecord.kind === "client") {
      const { sequence: _sequence, kind: _kind, ...action } = sourceRecord;
      clientActions.push({ sequence: clientActions.length + 1, ...action });
      continue;
    }
    const record = structuredClone(sourceRecord);
    const sourceSequence = record.sequence;
    record.sequence = workerTranscript.length + 1;
    if (Number.isInteger(sourceSequence)) sequenceMap.set(sourceSequence, record.sequence);
    workerTranscript.push(record);
  }
  requireValue(clientActions.length > 0, `${worker.alias} has no Host client actions.`);
  requireValue(workerTranscript.length > 0, `${worker.alias} has no Worker transcript.`);
  requireValue(
    workerTranscript.every((record) => record.kind !== "client"),
    `${worker.alias} Worker transcript still contains Host actions.`,
  );

  worker.clientActions = clientActions;
  worker.transcript = workerTranscript;
  worker.processBoundaries = workerTranscript.filter(
    (record) => record.kind === "process" && ["exit", "close"].includes(record.event),
  );
  const exitIndex = worker.processBoundaries.findIndex((record) => record.event === "exit");
  const closeIndex = worker.processBoundaries.findIndex((record) => record.event === "close");
  worker.exitBeforeClose = exitIndex >= 0 && closeIndex > exitIndex;

  remapSequenceFields(caseResult.ordering, sequenceMap);
  for (const field of ["response", "promptResponse"]) {
    const summary = caseResult[field];
    if (summary && Number.isInteger(summary.sequence) && sequenceMap.has(summary.sequence)) {
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

function normalizeProtocolErrors(capture) {
  const protocolErrors = capture?.cases?.protocolErrors;
  const worker = capture?.cases?.normalPromptEof?.worker;
  if (!protocolErrors || !worker) return;
  const parseSequence = findResponseSequence(worker, null, "parse");
  const unknownSequence = findResponseSequence(worker, "normal-unicode-unknown");
  requireValue(
    Number.isSafeInteger(parseSequence) && Number.isSafeInteger(unknownSequence),
    "Normalized protocol error Response sequences are missing.",
  );
  protocolErrors.malformedJson.responseSequence = parseSequence;
  protocolErrors.unknownCommand.responseSequence = unknownSequence;
}

export function normalizeRpcWorkerCapture(input) {
  const capture = structuredClone(input);
  normalizeProviderErrorStateRace(capture);
  for (const caseName of [
    "normalPromptEof",
    "restartResumeSigterm",
    "preflightRejection",
    "acceptedProviderError",
  ]) {
    normalizeWorkerCase(capture.cases?.[caseName]);
  }
  normalizeProtocolErrors(capture);
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

export function normalizeRpcWorkerResult(input) {
  const result = structuredClone(input);
  if (result?.capture) {
    result.capture = normalizeRpcWorkerCapture(result.capture);
    delete result.contractFingerprint;
    result.contractFingerprint = fingerprint(result);
    return result;
  }
  return normalizeRpcWorkerCapture(result);
}

function resequenceTranscript(caseResult) {
  for (const [index, record] of caseResult.worker.transcript.entries()) {
    record.sequence = index + 1;
  }
  caseResult.worker.processBoundaries = caseResult.worker.transcript.filter(
    (record) => record.kind === "process" && ["exit", "close"].includes(record.event),
  );
  const findEvent = (type, predicate = () => true) =>
    caseResult.worker.transcript.find(
      (record) =>
        record.kind === "event" &&
        record.event?.type === type &&
        predicate(record.event),
    )?.sequence;
  const prompt = promptResponseSequence(caseResult);
  const stateResponse = matchingStateResponses(caseResult)[0];
  const settled = findEvent("agent_settled");
  Object.assign(caseResult.ordering, {
    promptResponseSequence: prompt,
    agentStartSequence: findEvent("agent_start"),
    assistantErrorMessageEndSequence: findEvent(
      "message_end",
      (event) =>
        event.message?.role === "assistant" && event.message?.stopReason === "error",
    ),
    agentEndSequence: findEvent("agent_end"),
    agentSettledSequence: settled,
    stateDuringResponseSequence: stateResponse.sequence,
    promptResponsePrecedesAgentStart:
      prompt < findEvent("agent_start"),
    failureExpressedAfterAcceptance: true,
    stateDuringAfterAcceptanceBeforeSettled:
      stateResponse.sequence > prompt && stateResponse.sequence < settled,
  });
  caseResult.promptResponse.sequence = prompt;
}

function moveStateResponseAfterSettled(caseResult) {
  const transcript = caseResult.worker.transcript;
  const responseIndex = transcript.findIndex(
    (record) =>
      record.kind === "response" &&
      record.id === "provider-error-state-during" &&
      record.command === "get_state",
  );
  const settledIndex = transcript.findIndex(
    (record) => record.kind === "event" && record.event?.type === "agent_settled",
  );
  requireValue(responseIndex >= 0 && settledIndex >= 0, "Mutation test source is incomplete.");
  const [response] = transcript.splice(responseIndex, 1);
  const adjustedSettledIndex = transcript.findIndex(
    (record) => record.kind === "event" && record.event?.type === "agent_settled",
  );
  transcript.splice(adjustedSettledIndex + 1, 0, response);
  resequenceTranscript(caseResult);
}

export function normalizeProviderErrorCaseForTest(rawCase) {
  const capture = {
    contract: {},
    cases: { acceptedProviderError: structuredClone(rawCase) },
  };
  normalizeProviderErrorStateRace(capture);
  normalizeWorkerCase(capture.cases.acceptedProviderError);
  return capture.cases.acceptedProviderError;
}

function expectNormalizationFailure(label, rawCase) {
  let error;
  try {
    normalizeProviderErrorCaseForTest(rawCase);
  } catch (caught) {
    error = caught;
  }
  requireValue(error instanceof Error, `${label} unexpectedly normalized successfully.`);
}

export function assertProviderErrorNormalizationMutationTests(rawCase) {
  const baseline = normalizeProviderErrorCaseForTest(rawCase);

  const settled = structuredClone(rawCase);
  const settledResponse = matchingStateResponses(settled)[0];
  settledResponse.data = structuredClone(settled.finalState);
  settled.stateDuring = structuredClone(settled.finalState);
  moveStateResponseAfterSettled(settled);
  const settledNormalized = normalizeProviderErrorCaseForTest(settled);
  requireValue(
    isDeepStrictEqual(settledNormalized, baseline),
    "The complete settled Provider-error State variant did not normalize deterministically.",
  );

  const contentDrift = structuredClone(rawCase);
  const contentResponse = matchingStateResponses(contentDrift)[0];
  contentResponse.data.model.provider = "invalid-provider";
  contentResponse.data.sessionId = "invalid-session";
  contentResponse.data.pendingMessageCount = 9;
  contentDrift.stateDuring = structuredClone(contentResponse.data);
  expectNormalizationFailure("Provider-error complete State content mutation", contentDrift);

  const lateRunning = structuredClone(rawCase);
  moveStateResponseAfterSettled(lateRunning);
  expectNormalizationFailure("Provider-error running State after agent_settled", lateRunning);

  const orderingDrift = structuredClone(rawCase);
  orderingDrift.ordering.stateDuringAfterAcceptanceBeforeSettled =
    !orderingDrift.ordering.stateDuringAfterAcceptanceBeforeSettled;
  expectNormalizationFailure(
    "Provider-error State ordering summary mutation",
    orderingDrift,
  );

  return true;
}
