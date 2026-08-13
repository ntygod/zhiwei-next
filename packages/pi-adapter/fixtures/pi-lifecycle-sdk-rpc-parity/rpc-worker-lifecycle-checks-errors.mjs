import {
  RPC_WORKER_ERROR_PROVIDER_API_ID,
  RPC_WORKER_ERROR_PROVIDER_ID,
  RPC_WORKER_PROVIDER_ERROR_MESSAGE,
  RPC_WORKER_PROVIDER_ERROR_PROMPT,
} from "../../../../scripts/probes/pi-sdk-rpc-parity-contract.mjs";
import {
  clientActions,
  equal,
  events,
  increasing,
  requireValue,
  responses,
  roles,
  validateExtension,
  validateProcess,
  validateState,
} from "./rpc-worker-lifecycle-checks-common.mjs";

const PREFLIGHT_PREFIX = "No API key found for the selected model.";
const PREFLIGHT_PATHS = [
  "<pi-install-dir>/node_modules/@earendil-works/pi-coding-agent/docs/providers.md",
  "<pi-install-dir>/node_modules/@earendil-works/pi-coding-agent/docs/models.md",
];

export function validatePreflight(violations, capture) {
  const preflight = capture?.cases?.preflightRejection;
  validateProcess(violations, preflight, 0, false);
  const promptResponses = responses(preflight, "preflight-prompt", "prompt");
  requireValue(
    violations,
    preflight?.response?.success === false &&
      preflight.response.responseCount === 1 &&
      promptResponses.length === 1 &&
      promptResponses[0]?.success === false &&
      promptResponses[0]?.error === preflight.response.error,
    "Preflight Prompt response drifted.",
  );
  requireValue(
    violations,
    preflight?.response?.error?.startsWith(PREFLIGHT_PREFIX) === true &&
      PREFLIGHT_PATHS.every((path) => preflight.response.error.includes(path)),
    "Preflight error category/path drifted.",
  );
  requireValue(
    violations,
    preflight?.agentStartCount === 0 &&
      events(preflight, "agent_start").length === 0 &&
      preflight.workerRemainedUsable === true &&
      preflight.stateBefore?.isStreaming === false &&
      preflight.stateAfter?.isStreaming === false &&
      preflight.messagesAfter?.length === 0,
    "Preflight rejection side effects drifted.",
  );
  requireValue(
    violations,
    preflight?.shutdown?.mechanism === "stdin-eof" &&
      preflight.shutdown.close?.code === 0 &&
      preflight.shutdown.close?.signal === null &&
      clientActions(preflight).some((action) => action.action === "stdin-end"),
    "Preflight EOF shutdown drifted.",
  );
}

export function validateProviderError(violations, capture) {
  const providerError = capture?.cases?.acceptedProviderError;
  validateProcess(violations, providerError, 0, true);
  validateExtension(
    violations,
    providerError,
    RPC_WORKER_ERROR_PROVIDER_ID,
    RPC_WORKER_ERROR_PROVIDER_API_ID,
  );
  requireValue(
    violations,
    providerError?.prompt === RPC_WORKER_PROVIDER_ERROR_PROMPT &&
      providerError.errorMessage === RPC_WORKER_PROVIDER_ERROR_MESSAGE &&
      providerError.promptResponse?.success === true &&
      providerError.promptResponse.responseCount === 1 &&
      responses(providerError, "provider-error-prompt", "prompt").length === 1 &&
      responses(providerError, "provider-error-prompt", "prompt")[0]?.success ===
        true,
    "Provider-error Prompt acceptance drifted.",
  );
  requireValue(
    violations,
    events(providerError, "agent_start").length === 1 &&
      events(providerError, "agent_end").length === 1 &&
      events(providerError, "agent_settled").length === 1 &&
      events(
        providerError,
        "agent_end",
        (event) => event.willRetry === false,
      ).length === 1,
    "Provider-error Agent Run drifted.",
  );
  equal(
    violations,
    capture?.contract?.sequenceDomains,
    {
      workerTranscript: "worker-output-and-process-boundaries",
      clientActions: "host-local-actions",
      crossDomainTotalOrder: false,
      raceSensitiveSnapshots: "bounded-validation-then-excluded",
    },
    "Sequence-domain contract drifted.",
  );
  equal(
    violations,
    providerError?.acceptanceStateProbe,
    {
      command: "get_state",
      requestId: "provider-error-state-during",
      responseObserved: true,
      allowedObservedPhases: ["running", "settled"],
      excludedFromFrozenFixture: true,
      reason: "provider-error-completion-races-state-response",
    },
    "Provider-error State probe disclosure drifted.",
  );
  requireValue(
    violations,
    !Object.hasOwn(providerError ?? {}, "stateDuring") &&
      responses(
        providerError,
        "provider-error-state-during",
        "get_state",
      ).length === 0 &&
      clientActions(providerError).some(
        (action) =>
          action.action === "send" &&
          action.id === "provider-error-state-during" &&
          action.command === "get_state",
      ),
    "Provider-error race-sensitive State was not excluded correctly.",
  );
  requireValue(
    violations,
    providerError?.ordering &&
      !Object.hasOwn(
        providerError.ordering,
        "stateDuringResponseSequence",
      ) &&
      !Object.hasOwn(
        providerError.ordering,
        "stateDuringAfterAcceptanceBeforeSettled",
      ) &&
      providerError.ordering.promptResponsePrecedesAgentStart === true &&
      providerError.ordering.failureExpressedAfterAcceptance === true &&
      increasing([
        providerError.ordering.promptResponseSequence,
        providerError.ordering.agentStartSequence,
        providerError.ordering.assistantErrorMessageEndSequence,
        providerError.ordering.agentEndSequence,
        providerError.ordering.agentSettledSequence,
      ]),
    "Provider-error stable acceptance/failure ordering drifted.",
  );
  validateState(violations, providerError?.finalState, {
    provider: RPC_WORKER_ERROR_PROVIDER_ID,
    api: RPC_WORKER_ERROR_PROVIDER_API_ID,
    streaming: false,
    messageCount: 2,
    persistent: false,
  });
  equal(
    violations,
    roles(providerError?.finalMessages),
    ["user", "assistant"],
    "Provider-error final roles drifted.",
  );
  requireValue(
    violations,
    providerError?.finalMessages?.[0]?.text ===
      RPC_WORKER_PROVIDER_ERROR_PROMPT &&
      providerError.finalMessages[1]?.stopReason === "error" &&
      providerError.finalMessages[1]?.errorMessage ===
        RPC_WORKER_PROVIDER_ERROR_MESSAGE &&
      providerError.lastAssistantText === "" &&
      providerError.workerRemainedUsable === true,
    "Provider-error persisted outcome drifted.",
  );
  requireValue(
    violations,
    providerError?.shutdown?.mechanism === "stdin-eof" &&
      providerError.shutdown.close?.code === 0 &&
      providerError.shutdown.close?.signal === null &&
      clientActions(providerError).some((action) => action.action === "stdin-end"),
    "Provider-error EOF shutdown drifted.",
  );
}
