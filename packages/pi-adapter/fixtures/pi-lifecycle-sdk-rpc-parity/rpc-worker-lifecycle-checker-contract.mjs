import {
  PI_PACKAGE_INTEGRITY,
  PI_PACKAGE_NAME,
  PI_PACKAGE_SHASUM,
  PI_PACKAGE_VERSION,
  PI_RELEASE_COMMIT,
  PI_RELEASE_TAG,
  RPC_WORKER_LIFECYCLE_SCENARIO,
  RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
  RPC_WORKER_MODEL_ID,
} from "../../../../scripts/probes/pi-sdk-rpc-parity-contract.mjs";
import {
  equal,
  fingerprint,
  requireValue,
} from "./rpc-worker-lifecycle-checker-core.mjs";

const CONTAINER =
  "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";

export function validateEnvelope(result) {
  const capture = result?.capture;
  requireValue(result?.schemaVersion === 1, "Outer schemaVersion must be 1.");
  requireValue(result?.status === "passed", "Outer result must pass.");
  requireValue(
    result?.scenario === RPC_WORKER_LIFECYCLE_SCENARIO,
    "Outer scenario drifted.",
  );
  requireValue(
    result?.contractFingerprint === fingerprint(result),
    "Outer fingerprint is invalid.",
  );
  equal(
    result?.upstream,
    {
      repository: "earendil-works/pi",
      releaseTag: PI_RELEASE_TAG,
      commit: PI_RELEASE_COMMIT,
    },
    "Upstream identity drifted.",
  );
  requireValue(
    result?.artifact?.name === PI_PACKAGE_NAME &&
      result.artifact.version === PI_PACKAGE_VERSION &&
      result.artifact.integrity === PI_PACKAGE_INTEGRITY &&
      result.artifact.shasum === PI_PACKAGE_SHASUM &&
      result.artifact.installScriptsExecuted === false,
    "Artifact identity drifted.",
  );
  requireValue(
    result?.environment?.node === "22.23.1" &&
      result.environment.npm === "10.9.8" &&
      result.environment.platform === "linux-x64" &&
      result.environment.containerImage === CONTAINER,
    "Runtime environment drifted.",
  );
  equal(
    result?.isolation,
    {
      hostSecretsPassedToProbe: false,
      hostWorkspaceMounted: false,
      sourceBundleReadOnly: true,
      containerRootFilesystemReadOnly: true,
      containerCapabilitiesDropped: true,
      containerNoNewPrivileges: true,
    },
    "Isolation boundary drifted.",
  );

  requireValue(
    capture?.schemaVersion === RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
    "Capture schemaVersion drifted.",
  );
  requireValue(capture?.status === "passed", "Capture must pass.");
  requireValue(
    capture?.scenario === RPC_WORKER_LIFECYCLE_SCENARIO,
    "Capture scenario drifted.",
  );
  requireValue(
    capture?.contractFingerprint === fingerprint(capture),
    "Capture fingerprint is invalid.",
  );
  equal(
    capture?.contract?.package,
    {
      name: PI_PACKAGE_NAME,
      version: PI_PACKAGE_VERSION,
      integrity: PI_PACKAGE_INTEGRITY,
      shasum: PI_PACKAGE_SHASUM,
      releaseTag: PI_RELEASE_TAG,
      releaseCommit: PI_RELEASE_COMMIT,
      executionMode: "node-cli-entry-real-subprocess",
    },
    "Capture package contract drifted.",
  );
  equal(
    capture?.contract?.protocol,
    {
      transport: "stdio-jsonl",
      framing: "lf-only",
      unicodeLineSeparatorsInsideJsonString: ["U+2028", "U+2029"],
      unknownCommandResponseCommand: "echo-request-type",
      promptResponseMeaning: "preflight-acceptance-not-run-completion",
    },
    "Protocol contract drifted.",
  );
  requireValue(
    capture?.contract?.providers?.promptsSentToExternalProvider === 0,
    "External Provider prompt count drifted.",
  );
  equal(
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
    capture?.security,
    {
      hostSecretsPassedToWorker: false,
      realProviderCredentialsUsed: false,
      promptsSentToExternalProvider: 0,
      businessFileWrites: false,
      networkCallsByWorkerProvider: false,
      rawEnvironmentDumpIncluded: false,
    },
    "Security contract drifted.",
  );
  equal(
    capture?.sanitization,
    {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      rawResponseIdIncluded: false,
      processPidIncluded: false,
      extensionRunIdentityIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      stderrLimitedToSanitizedLines: true,
    },
    "Sanitization contract drifted.",
  );
  requireValue(
    capture?.aliases?.sessionIds?.every((value) =>
      /^session-id-[1-9]\d*$/.test(value),
    ),
    "Session ID aliases drifted.",
  );
  requireValue(
    capture?.aliases?.sessionFiles?.every((value) =>
      /^session-file-[1-9]\d*$/.test(value),
    ),
    "Session file aliases drifted.",
  );
}

export function validateState(
  state,
  { provider, api, streaming, count, persistent },
) {
  requireValue(
    state?.model?.provider === provider,
    `State provider must be ${provider}.`,
  );
  requireValue(state?.model?.id === RPC_WORKER_MODEL_ID, "State model drifted.");
  requireValue(state?.model?.api === api, `State API must be ${api}.`);
  requireValue(state?.thinkingLevel === "off", "State thinking level drifted.");
  requireValue(
    state?.isStreaming === streaming,
    `State isStreaming must be ${streaming}.`,
  );
  requireValue(state?.isCompacting === false, "State must not be compacting.");
  requireValue(
    state?.messageCount === count,
    `State messageCount must be ${count}.`,
  );
  requireValue(
    state?.pendingMessageCount === 0,
    "State pendingMessageCount must be zero.",
  );
  requireValue(
    /^session-id-[1-9]\d*$/.test(state?.sessionId ?? ""),
    "State Session ID must be aliased.",
  );
  if (persistent) {
    requireValue(
      /^session-file-[1-9]\d*$/.test(state?.sessionFile ?? ""),
      "Persistent State Session file must be aliased.",
    );
  } else {
    requireValue(
      state?.sessionFile === undefined,
      "No-session State must not have a Session file.",
    );
  }
}

export function validateExtension(caseResult, provider, api) {
  const evidence = caseResult?.extensionEvidence;
  requireValue(
    evidence?.schemaVersion === RPC_WORKER_LIFECYCLE_SCHEMA_VERSION,
    "Extension schema drifted.",
  );
  requireValue(evidence?.status === "passed", "Extension evidence must pass.");
  requireValue(
    evidence?.scenario === RPC_WORKER_LIFECYCLE_SCENARIO,
    "Extension scenario drifted.",
  );
  requireValue(
    evidence?.runIdentityMatched === true,
    "Extension run identity did not match.",
  );
  requireValue(
    evidence?.shutdown?.observed === true &&
      evidence.shutdown.reason === "quit",
    "Extension shutdown evidence drifted.",
  );
  requireValue(
    evidence?.provider?.id === provider &&
      evidence.provider.api === api &&
      evidence.provider.modelId === RPC_WORKER_MODEL_ID &&
      evidence.provider.callCount === 1 &&
      evidence.provider.pendingResponses === 0 &&
      evidence.provider.promptsSentToExternalProvider === 0,
    "Extension Provider evidence drifted.",
  );
  requireValue(
    caseResult?.extensionEvents?.some(
      (event) =>
        event.type === "session_shutdown" && event.reason === "quit",
    ),
    "Extension event log is missing quit shutdown.",
  );
}
