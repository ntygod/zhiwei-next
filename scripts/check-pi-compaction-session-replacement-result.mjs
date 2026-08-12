import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_COMPACTION_SESSION_REPLACEMENT_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json",
);
const violations = [];

const COMPACTION_SUMMARY = [
  "Verified extension summary.",
  "- First fixed compaction fact was recorded.",
  "- Second fixed compaction fact remains the recent turn.",
].join("\n");

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

function findPhase(phases, phase, sessionObject) {
  return phases.findIndex(
    (item) => item.phase === phase && (sessionObject === undefined || item.sessionObject === sessionObject),
  );
}

const result = JSON.parse(await readFile(inputPath, "utf8"));
requireValue(result.schemaVersion === 1, "Compaction/replacement result schemaVersion must be 1.");
requireValue(result.status === "passed", `Compaction/replacement status must be passed, got ${result.status}.`);
requireValue(
  result.scenario === "compaction-session-replacement",
  "Scenario must be compaction-session-replacement.",
);
requireValue(
  result.upstream?.repository === "earendil-works/pi" &&
    result.upstream?.releaseTag === "v0.84.1" &&
    result.upstream?.commit === "53fa77ccd8a279eb87e92294ef3687b03ff80112",
  "Compaction/replacement upstream baseline is incorrect.",
);
requireValue(
  result.artifact?.name === "@earendil-works/pi-coding-agent" &&
    result.artifact?.version === "0.84.1",
  "Compaction/replacement Artifact identity is incorrect.",
);
requireValue(
  result.artifact?.integrity ===
    "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
  "Compaction/replacement Artifact integrity differs from pinned registry evidence.",
);
requireValue(
  result.artifact?.shasum === "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
  "Compaction/replacement Artifact shasum differs from pinned registry evidence.",
);
requireValue(result.artifact?.installScriptsExecuted === false, "Install scripts must remain disabled.");
requireValue(result.environment?.node === "22.23.1", "Node version must be 22.23.1.");
requireValue(result.environment?.npm === "10.9.8", "npm version must be 10.9.8.");
requireValue(result.environment?.platform === "linux-x64", "Platform must be linux-x64.");
requireValue(
  result.environment?.containerImage ===
    "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "Container image is not the pinned digest.",
);
requireValue(result.isolation?.hostSecretsPassedToProbe === false, "Host secrets must not reach the probe.");
requireValue(result.isolation?.hostWorkspaceMounted === false, "Host checkout must not be mounted into the probe.");
requireValue(result.isolation?.sourceBundleReadOnly === true, "Probe source bundle must be read-only.");
requireValue(result.isolation?.containerRootFilesystemReadOnly === true, "Probe root filesystem must be read-only.");
requireValue(result.isolation?.containerCapabilitiesDropped === true, "Probe capabilities must be dropped.");
requireValue(result.isolation?.containerNoNewPrivileges === true, "Probe must use no-new-privileges.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested capture schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested capture status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "compaction-session-replacement", "Nested scenario is incorrect.");
requireValue(
  capture?.package?.name === "@earendil-works/pi-coding-agent" && capture?.package?.version === "0.84.1",
  "Nested package identity is incorrect.",
);

const compact = capture?.cases?.manualCompaction;
requireValue(Boolean(compact), "Manual compaction case is missing.");
requireValue(compact?.summary === COMPACTION_SUMMARY, "Manual compaction summary drifted.");
requireValue(compact?.provider?.id === "zhiwei-compaction-faux", "Manual compaction must use its dedicated Faux provider.");
requireValue(compact?.provider?.callsBeforeCompact === 2, "Manual compaction must seed exactly two Faux calls.");
requireValue(
  compact?.provider?.callsAfterCompact === compact?.provider?.callsBeforeCompact,
  "Extension-provided manual compaction must not call the Faux provider.",
);
requireValue(compact?.provider?.pendingBeforeCompact === 1, "Compaction proof response must be pending before compact().");
requireValue(compact?.provider?.pendingAfterCompact === 1, "Compaction proof response must remain unused after compact().");
requireValue(compact?.provider?.promptsSentToExternalProvider === 0, "Manual compaction must not contact an external provider.");
requireValue(compact?.before?.isIdle === true, "Manual compaction seed Session must be idle.");
requireValue(compact?.before?.isCompacting === false, "Manual compaction seed Session must not already be compacting.");
requireValue(compact?.after?.isIdle === true, "Manual compact() must return at an idle boundary.");
requireValue(compact?.after?.isCompacting === false, "Manual compact() must return after compaction ends.");
requireValue(compact?.compactResult?.summary === COMPACTION_SUMMARY, "compact() result summary drifted.");
requireValue(compact?.after?.messages?.[0]?.role === "compactionSummary", "Compacted context must begin with compactionSummary.");
requireValue(compact?.after?.messages?.[0]?.summary === COMPACTION_SUMMARY, "CompactionSummary message lost the extension summary.");
requireValue(compact?.counts?.compactionEntriesAfter === 1, "Exactly one compaction entry must be persisted.");
requireValue(count(compact?.publicEvents ?? [], "compaction_start") === 1, "Public trace must contain one compaction_start.");
requireValue(count(compact?.publicEvents ?? [], "compaction_end") === 1, "Public trace must contain one compaction_end.");
requireValue(count(compact?.extensionEvents ?? [], "session_before_compact") === 1, "Extension trace must contain one session_before_compact.");
requireValue(count(compact?.extensionEvents ?? [], "session_compact") === 1, "Extension trace must contain one session_compact.");
requireValue(
  compact?.extensionEvents?.find((event) => event.type === "session_compact")?.fromExtension === true,
  "session_compact must report fromExtension=true.",
);
requireValue(
  compact?.extensionEvents?.find((event) => event.type === "session_compact")?.reason === "manual",
  "session_compact reason must be manual.",
);
requireValue(
  compact?.lifecycleNotes?.some(
    (note) => note.type === "shutdown-host-boundary" && note.mechanism === "session.extensionRunner.emit",
  ),
  "Manual compaction case must preserve the host shutdown boundary.",
);

const replacement = capture?.cases?.sessionReplacement;
requireValue(Boolean(replacement), "Session replacement case is missing.");
requireValue(replacement?.provider?.id === "zhiwei-session-replacement-faux", "Replacement must use its dedicated Faux provider.");
requireValue(replacement?.provider?.callCount === 3, "Replacement case must consume three Faux responses.");
requireValue(replacement?.provider?.pendingResponses === 0, "Replacement Faux responses must be fully consumed.");
requireValue(replacement?.provider?.promptsSentToExternalProvider === 0, "Replacement must not contact an external provider.");
requireValue(replacement?.operations?.newSession?.cancelled === false, "newSession() must not be cancelled.");
requireValue(replacement?.operations?.switchSession?.cancelled === false, "switchSession() must not be cancelled.");
requireValue(
  JSON.stringify(replacement?.aliases?.sessionObjects) ===
    JSON.stringify(["session-object-1", "session-object-2", "session-object-3"]),
  "Replacement must create three distinct AgentSession object aliases.",
);
requireValue(
  JSON.stringify(replacement?.aliases?.sessionFiles) ===
    JSON.stringify(["session-file-1", "session-file-2"]),
  "Replacement must use two stable Session file aliases.",
);
requireValue(replacement?.counts?.extensionGenerations === 3, "Replacement must create three Extension generations.");
requireValue(replacement?.negativeEvidence?.legacySubscriptionMigrated === false, "Legacy subscription negative evidence must remain false.");
requireValue(replacement?.negativeEvidence?.publicSubscriptionRequiresRebind === true, "Replacement must require explicit Public subscription rebind.");
requireValue(
  replacement?.negativeEvidence?.legacyCountAfterOriginalPrompt ===
    replacement?.negativeEvidence?.legacyCountAfterNewPrompt &&
    replacement?.negativeEvidence?.legacyCountAfterOriginalPrompt ===
      replacement?.negativeEvidence?.legacyCountAfterResumePrompt,
  "Legacy Public listener received replacement Session events.",
);
requireValue(replacement?.snapshots?.initial?.sessionFile === "session-file-1", "Initial Session file alias is incorrect.");
requireValue(replacement?.snapshots?.newBeforePrompt?.sessionFile === "session-file-2", "New Session file alias is incorrect.");
requireValue(replacement?.snapshots?.newBeforePrompt?.messages?.length === 0, "New Session must start with an empty context.");
requireValue(replacement?.snapshots?.resumedBeforePrompt?.sessionFile === "session-file-1", "Resume must restore the original Session file.");
requireValue(
  JSON.stringify(replacement?.snapshots?.resumedBeforePrompt?.messages) ===
    JSON.stringify(replacement?.snapshots?.initial?.messages),
  "Resume must restore the original persisted message context.",
);
requireValue(
  JSON.stringify(replacement?.snapshots?.resumedAfterPrompt?.messages?.map((message) => message.role)) ===
    JSON.stringify(["user", "assistant", "user", "assistant"]),
  "Resumed Session must contain the original and resumed turns.",
);
requireValue(replacement?.snapshots?.resumedAfterPrompt?.isIdle === true, "Resumed prompt must settle at an idle boundary.");

const phases = replacement?.replacementPhases ?? [];
const newRebindEnd = findPhase(phases, "rebind-session:end", "session-object-2");
const newWith = findPhase(phases, "with-session:new");
const resumeRebindEnd = findPhase(phases, "rebind-session:end", "session-object-3");
const resumeWith = findPhase(phases, "with-session:resume");
requireValue(newRebindEnd >= 0 && newWith > newRebindEnd, "newSession withSession must run after rebindSession.");
requireValue(resumeRebindEnd >= 0 && resumeWith > resumeRebindEnd, "switchSession withSession must run after rebindSession.");
requireValue(count(replacement?.extensionEvents ?? [], "session_before_switch") === 2, "Replacement Extension trace must contain two session_before_switch events.");
requireValue(count(replacement?.extensionEvents ?? [], "session_shutdown") === 3, "Replacement Extension trace must include two replacements and final dispose shutdown.");
requireValue(count(replacement?.extensionEvents ?? [], "session_start") === 3, "Replacement Extension trace must contain startup, new, and resume session_start.");
requireValue(
  replacement?.lifecycleNotes?.some(
    (note) => note.type === "runtime-dispose-boundary" && note.mechanism === "AgentSessionRuntime.dispose",
  ),
  "Replacement case must preserve the runtime dispose boundary.",
);

for (const [field, expected] of Object.entries({
  absolutePathsIncluded: false,
  rawSessionIdIncluded: false,
  rawSessionFileIncluded: false,
  rawEntryIdIncluded: false,
  environmentDumpIncluded: false,
  credentialsIncluded: false,
  rawChainOfThoughtIncluded: false,
})) {
  requireValue(capture?.sanitization?.[field] === expected, `Sanitization.${field} must be ${expected}.`);
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
  /\.jsonl(?:"|\\|\/)/i,
]) {
  requireValue(!pattern.test(serialized), `Compaction/replacement result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Result must not contain a raw sessionId field.");
requireValue(
  !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
  "Result must not contain raw UUID-shaped Session or Entry IDs.",
);
requireValue(result.contractFingerprint === fingerprint(result), "Outer contract fingerprint is invalid.");
requireValue(capture.contractFingerprint === fingerprint(capture), "Nested contract fingerprint is invalid.");

if (violations.length > 0) {
  console.error(
    "Pi compaction/session replacement result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Pi compaction/session replacement runtime result: OK (${result.contractFingerprint})`);
