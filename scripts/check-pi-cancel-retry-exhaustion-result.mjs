import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_CANCEL_RETRY_EXHAUSTION_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-cancel-retry-exhaustion.json",
);
const violations = [];

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function fingerprint(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function checkContiguousSequence(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(
      events[index]?.sequence === index + 1,
      `${label} sequence is not contiguous at index ${index}.`,
    );
  }
}

function checkCommonCase(caseId, result) {
  requireValue(result?.provider?.promptsSentToExternalProvider === 0, `${caseId} must not contact an external provider.`);
  requireValue(result?.outcome?.prompt?.status === "resolved", `${caseId} prompt must resolve.`);
  requireValue(result?.outcome?.sessionWasIdleBeforeShutdown === true, `${caseId} must be idle before shutdown.`);
  requireValue(result?.outcome?.sessionWasRetryingBeforeShutdown === false, `${caseId} must not be retrying before shutdown.`);
  requireValue(result?.outcome?.pendingMessageCountBeforeShutdown === 0, `${caseId} pending message count must be zero.`);

  const sessionEvents = result?.sessionEvents ?? [];
  const extensionEvents = result?.extensionEvents ?? [];
  checkContiguousSequence(sessionEvents, `${caseId} Session events`);
  checkContiguousSequence(extensionEvents, `${caseId} Extension events`);
  requireValue(count(sessionEvents, "agent_settled") === 1, `${caseId} must emit one public agent_settled.`);
  requireValue(count(extensionEvents, "agent_settled") === 1, `${caseId} must emit one Extension agent_settled.`);
  requireValue(count(extensionEvents, "session_shutdown") === 1, `${caseId} must emit one Extension session_shutdown.`);
  requireValue(
    result?.ordering?.publicSettledIndex >= 0,
    `${caseId} public settled index must exist.`,
  );
  requireValue(
    result?.ordering?.extensionSettledIndex >= 0 &&
      result?.ordering?.extensionShutdownIndex > result?.ordering?.extensionSettledIndex,
    `${caseId} Extension settled must precede shutdown.`,
  );
  requireValue(
    sessionEvents.every((event) => !event.type.startsWith("tool_execution_")),
    `${caseId} must not execute tools.`,
  );
  requireValue(
    extensionEvents.every((event) => event.type !== "tool_call" && event.type !== "tool_result"),
    `${caseId} Extension trace must not contain Tool events.`,
  );
  requireValue(
    JSON.stringify(result?.lifecycleNotes) ===
      JSON.stringify([
        { type: "shutdown-host-boundary", mechanism: "session.extensionRunner.emit", reason: "exit" },
      ]),
    `${caseId} lifecycle notes must preserve the host shutdown boundary.`,
  );
}

const result = JSON.parse(await readFile(inputPath, "utf8"));
requireValue(result.schemaVersion === 1, "Cancellation/retry result schemaVersion must be 1.");
requireValue(result.status === "passed", `Cancellation/retry status must be passed, got ${result.status}.`);
requireValue(result.scenario === "cancel-retry-exhaustion", "Scenario must be cancel-retry-exhaustion.");
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Cancellation/retry upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" && result.artifact?.version === "0.84.1",
  "Cancellation/retry Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Cancellation/retry Artifact integrity differs from pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Cancellation/retry Artifact shasum differs from pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Cancellation/retry install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", "Cancellation/retry Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "Cancellation/retry npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "Cancellation/retry platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Cancellation/retry container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach cancellation/retry capture.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host checkout must not be mounted into cancellation/retry capture.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Cancellation/retry source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Cancellation/retry root filesystem must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Cancellation/retry container capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Cancellation/retry container must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested cancellation/retry schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested cancellation/retry status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "cancel-retry-exhaustion", "Nested scenario must be cancel-retry-exhaustion.");
requireValue(
  capture?.package?.name === "@earendil-works/pi-coding-agent" && capture?.package?.version === "0.84.1",
  "Nested cancellation/retry package identity is incorrect.",
);
requireValue(
  JSON.stringify(Object.keys(capture?.cases ?? {})) ===
    JSON.stringify(["activeStreamAbort", "retryBackoffAbort", "retryExhaustion"]),
  "Cancellation/retry capture must contain the three ordered cases.",
);

const active = capture?.cases?.activeStreamAbort;
checkCommonCase("active-stream-abort", active);
requireValue(active?.provider?.id === "zhiwei-active-abort-faux", "Active abort must use its dedicated Faux provider.");
requireValue(active?.provider?.callCount === 1, "Active abort must consume exactly one Faux response.");
requireValue(active?.provider?.pendingResponses === 0, "Active abort must consume its only Faux response.");
requireValue(active?.actions?.length === 1 && active.actions[0]?.type === "session.abort", "Active abort must record one session.abort action.");
requireValue(active?.actions?.[0]?.triggerEvent === "message_update", "Active abort must be triggered by a real message_update.");
requireValue(active?.actions?.[0]?.outcome?.status === "resolved", "session.abort() must resolve.");
requireValue(active?.outcome?.abort?.status === "resolved", "Active abort outcome must be resolved.");
requireValue(active?.outcome?.finalAssistant?.stopReason === "aborted", "Active abort must persist stopReason=aborted.");
requireValue(active?.outcome?.finalAssistant?.textLength > 0, "Active abort must preserve partial Assistant text.");
requireValue(
  active?.outcome?.finalAssistant?.textLength < active?.prompt?.responseTextLength,
  "Active abort must stop before the complete response is persisted.",
);
requireValue(
  JSON.stringify(active?.retry?.public?.agentEndWillRetry) === JSON.stringify([false]),
  "Active abort public agent_end.willRetry must be [false].",
);
requireValue(active?.retry?.public?.startEvents?.length === 0, "Active abort must not start Retry.");
requireValue(active?.retry?.public?.endEvents?.length === 0, "Active abort must not end Retry.");
requireValue(active?.retry?.extension?.startEvents?.length === 0, "Active abort Extension must not expose Retry start.");
requireValue(active?.retry?.extension?.endEvents?.length === 0, "Active abort Extension must not expose Retry end.");
requireValue(
  active?.retry?.extension?.agentEndWillRetry?.every((value) => value === null),
  "Active abort Extension agent_end must not invent willRetry.",
);
requireValue(count(active?.sessionEvents ?? [], "agent_end") === 1, "Active abort must emit one public agent_end.");

const retryAbort = capture?.cases?.retryBackoffAbort;
checkCommonCase("retry-backoff-abort", retryAbort);
requireValue(retryAbort?.provider?.id === "zhiwei-retry-abort-faux", "Retry abort must use its dedicated Faux provider.");
requireValue(retryAbort?.provider?.callCount === 1, "Retry abort must stop before a second provider call.");
requireValue(retryAbort?.provider?.pendingResponses === 1, "Retry abort must leave the proof response unused.");
requireValue(
  retryAbort?.actions?.length === 1 && retryAbort.actions[0]?.type === "session.abortRetry",
  "Retry abort must record one session.abortRetry action.",
);
requireValue(retryAbort?.actions?.[0]?.triggerEvent === "auto_retry_start", "abortRetry() must be driven by auto_retry_start.");
requireValue(
  JSON.stringify(retryAbort?.retry?.public?.agentEndWillRetry) === JSON.stringify([true]),
  "Retry abort must preserve agent_end(willRetry=true) without a later run.",
);
requireValue(retryAbort?.retry?.public?.startEvents?.length === 1, "Retry abort must emit one public auto_retry_start.");
requireValue(retryAbort?.retry?.public?.endEvents?.length === 1, "Retry abort must emit one public auto_retry_end.");
requireValue(retryAbort?.retry?.public?.endEvents?.[0]?.success === false, "Retry abort auto_retry_end must report success=false.");
requireValue(
  retryAbort?.retry?.public?.endEvents?.[0]?.finalError === "Retry cancelled",
  "Retry abort finalError must be Retry cancelled.",
);
requireValue(retryAbort?.retry?.extension?.startEvents?.length === 0, "Retry abort Extension must not expose auto_retry_start.");
requireValue(retryAbort?.retry?.extension?.endEvents?.length === 0, "Retry abort Extension must not expose auto_retry_end.");
requireValue(
  retryAbort?.retry?.extension?.agentEndWillRetry?.every((value) => value === null),
  "Retry abort Extension agent_end must not invent willRetry.",
);
requireValue(count(retryAbort?.sessionEvents ?? [], "agent_start") === 1, "Retry abort must not create a second Agent Run.");
requireValue(count(retryAbort?.sessionEvents ?? [], "agent_end") === 1, "Retry abort must emit one public agent_end.");

const exhaustion = capture?.cases?.retryExhaustion;
checkCommonCase("retry-exhaustion", exhaustion);
requireValue(exhaustion?.provider?.id === "zhiwei-retry-exhaustion-faux", "Retry exhaustion must use its dedicated Faux provider.");
requireValue(exhaustion?.provider?.callCount === 3, "Retry exhaustion must consume initial call plus two retries.");
requireValue(exhaustion?.provider?.pendingResponses === 1, "Retry exhaustion must leave the response beyond maxRetries unused.");
requireValue(exhaustion?.actions?.length === 0, "Retry exhaustion must not use a host cancellation action.");
requireValue(
  JSON.stringify(exhaustion?.retry?.public?.agentEndWillRetry) === JSON.stringify([true, true, false]),
  "Retry exhaustion public agent_end.willRetry sequence must be [true,true,false].",
);
requireValue(exhaustion?.retry?.public?.startEvents?.length === 2, "Retry exhaustion must emit two public auto_retry_start events.");
requireValue(exhaustion?.retry?.public?.endEvents?.length === 1, "Retry exhaustion must emit one terminal public auto_retry_end.");
requireValue(exhaustion?.retry?.public?.endEvents?.[0]?.success === false, "Retry exhaustion terminal auto_retry_end must report success=false.");
requireValue(
  exhaustion?.retry?.public?.endEvents?.[0]?.finalError === "overloaded_error",
  "Retry exhaustion terminal finalError must preserve overloaded_error.",
);
requireValue(exhaustion?.retry?.extension?.startEvents?.length === 0, "Retry exhaustion Extension must not expose auto_retry_start.");
requireValue(exhaustion?.retry?.extension?.endEvents?.length === 0, "Retry exhaustion Extension must not expose auto_retry_end.");
requireValue(
  exhaustion?.retry?.extension?.agentEndWillRetry?.every((value) => value === null),
  "Retry exhaustion Extension agent_end must not invent willRetry.",
);
requireValue(count(exhaustion?.sessionEvents ?? [], "agent_start") === 3, "Retry exhaustion must contain three public Agent Runs.");
requireValue(count(exhaustion?.sessionEvents ?? [], "agent_end") === 3, "Retry exhaustion must contain three public agent_end events.");

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
  fullActiveResponseIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `Cancellation/retry sanitization.${field} must be ${expected}.`);
}

const serialized = JSON.stringify(result);
for (const pattern of [
  /\/home\/runner\//,
  /\/tmp\/zhiwei-pi-lifecycle-/,
  /[A-Za-z]:\\Users\\/,
  /GITHUB_TOKEN/i,
  /authorization:\s*bearer/i,
  /cookie:/i,
  /api[_-]?key/i,
]) {
  requireValue(!pattern.test(serialized), `Cancellation/retry result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Cancellation/retry result must not contain a raw sessionId field.");
requireValue(
  !serialized.includes("cancel-me-".repeat(32)),
  "Cancellation/retry result must not contain the full active streaming response.",
);
requireValue(result.contractFingerprint === fingerprint(result), "Outer cancellation/retry contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested cancellation/retry contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error(
    "Pi cancellation/retry exhaustion result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Pi cancellation/retry exhaustion runtime result: OK (${result.contractFingerprint})`);
