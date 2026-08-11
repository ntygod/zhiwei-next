import { readFile } from "node:fs/promises";

const root = process.cwd();
const violations = [];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

const baselinePath = "packages/pi-adapter/fixtures/pi-upstream-baseline.json";
const sdkPath = "packages/pi-adapter/fixtures/sdk-event-surface.json";
const rpcPath = "packages/pi-adapter/fixtures/rpc-contract.jsonl";
const reportPath = "docs/spikes/pi-runtime-contract/README.md";

const baselineText = await read(baselinePath);
const sdkText = await read(sdkPath);
const rpcText = await read(rpcPath);
const report = await read(reportPath);
const packageJson = JSON.parse(await read("package.json"));

const forbiddenSecretPatterns = [
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{12,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
];
for (const [name, value] of Object.entries({
  [baselinePath]: baselineText,
  [sdkPath]: sdkText,
  [rpcPath]: rpcText,
  [reportPath]: report,
})) {
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(value)) violations.push(`${name} appears to contain a credential-like value.`);
  }
}

let baseline;
let sdk;
try {
  baseline = JSON.parse(baselineText);
} catch (error) {
  violations.push(`${baselinePath} is not valid JSON: ${error.message}`);
}
try {
  sdk = JSON.parse(sdkText);
} catch (error) {
  violations.push(`${sdkPath} is not valid JSON: ${error.message}`);
}

if (baseline) {
  requireValue(baseline.schemaVersion === 1, "Pi baseline schemaVersion must be 1.");
  requireValue(
    baseline.status === "source-verified-runtime-unverified" ||
      baseline.status === "source-and-runtime-verified",
    "Pi baseline status must distinguish source-only from dynamic verification.",
  );
  requireValue(baseline.upstream?.repository === "earendil-works/pi", "Unexpected Pi upstream repository.");
  requireValue(isSha(baseline.upstream?.commit), "Pi upstream must use a full immutable commit SHA.");
  requireValue(
    baseline.upstream?.historicalRedirectFrom === "badlogic/pi-mono",
    "Pi baseline must record the historical repository redirect.",
  );
  requireValue(
    baseline.package?.name === "@earendil-works/pi-coding-agent",
    "Unexpected Pi coding-agent package name.",
  );
  requireValue(
    typeof baseline.package?.version === "string" &&
      /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(baseline.package.version),
    "Pi package version must be exact semver.",
  );
  requireValue(
    baseline.package?.nodeEngine === ">=22.19.0",
    "Pi baseline must record the upstream Node >=22.19.0 requirement.",
  );
  requireValue(Array.isArray(baseline.sources) && baseline.sources.length >= 8, "Pi baseline needs at least eight pinned sources.");

  const roles = new Set();
  const paths = new Set();
  for (const source of baseline.sources ?? []) {
    requireValue(typeof source.role === "string" && source.role.length > 0, "Each Pi source needs a role.");
    requireValue(typeof source.path === "string" && source.path.length > 0, "Each Pi source needs a path.");
    requireValue(isSha(source.blobSha), `Pi source ${source.path ?? "<unknown>"} needs a blob SHA.`);
    requireValue(
      source.url ===
        `https://github.com/${baseline.upstream.repository}/blob/${baseline.upstream.commit}/${source.path}`,
      `Pi source ${source.path ?? "<unknown>"} must be pinned to the baseline commit URL.`,
    );
    requireValue(!roles.has(source.role), `Duplicate Pi source role: ${source.role}`);
    requireValue(!paths.has(source.path), `Duplicate Pi source path: ${source.path}`);
    roles.add(source.role);
    paths.add(source.path);
  }

  for (const requiredRole of [
    "package-manifest",
    "sdk-documentation",
    "agent-session-event-types",
    "core-agent-event-types",
    "agent-settled-regression-test",
    "rpc-documentation",
    "rpc-types",
    "rpc-jsonl-implementation",
    "rpc-jsonl-tests",
  ]) {
    requireValue(roles.has(requiredRole), `Pi baseline is missing source role: ${requiredRole}`);
  }

  requireValue(
    ["blocked", "passed"].includes(baseline.dynamicProbe?.status),
    "Dynamic probe status must be blocked or passed.",
  );
  if (baseline.dynamicProbe?.status === "blocked") {
    requireValue(
      Array.isArray(baseline.dynamicProbe?.attempts) && baseline.dynamicProbe.attempts.length >= 1,
      "A blocked dynamic probe must record attempted commands.",
    );
    requireValue(
      Array.isArray(baseline.dynamicProbe?.minimumRecheckEnvironment) &&
        baseline.dynamicProbe.minimumRecheckEnvironment.length >= 2,
      "A blocked dynamic probe must record a minimum recheck environment.",
    );
    requireValue(
      Array.isArray(baseline.dynamicProbe?.recheckCommands) &&
        baseline.dynamicProbe.recheckCommands.includes("npm run probe:pi:sdk") &&
        baseline.dynamicProbe.recheckCommands.includes("npm run probe:pi:rpc"),
      "A blocked dynamic probe must provide both recheck commands.",
    );
  }
}

if (sdk && baseline) {
  requireValue(sdk.schemaVersion === 1, "SDK event fixture schemaVersion must be 1.");
  requireValue(
    sdk.origin === "source-derived-not-runtime-capture",
    "SDK event fixture must not imply it is a runtime capture.",
  );
  requireValue(sdk.upstreamCommit === baseline.upstream.commit, "SDK fixture commit differs from baseline.");

  const coreEvents = new Map((sdk.coreAgentEvents ?? []).map((event) => [event.type, event]));
  const sessionEvents = new Map((sdk.agentSessionExtensions ?? []).map((event) => [event.type, event]));
  for (const type of [
    "agent_start",
    "agent_end",
    "turn_start",
    "turn_end",
    "message_start",
    "message_update",
    "message_end",
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
  ]) {
    requireValue(coreEvents.has(type), `SDK fixture is missing core event ${type}.`);
  }
  for (const type of [
    "agent_settled",
    "queue_update",
    "compaction_start",
    "compaction_end",
    "entry_appended",
    "auto_retry_start",
    "auto_retry_end",
    "bash_execution_update",
  ]) {
    requireValue(sessionEvents.has(type), `SDK fixture is missing session event ${type}.`);
  }
  for (const type of [
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
  ]) {
    requireValue(
      coreEvents.get(type)?.fields?.includes("toolCallId"),
      `${type} must expose toolCallId in the source-derived fixture.`,
    );
  }
  requireValue(
    sdk.correlation?.toolExecution?.stableField === "toolCallId",
    "SDK fixture must identify toolCallId as the tool lifecycle correlation field.",
  );
  requireValue(
    sdk.settlement?.agentEnd?.retrySignalField === "willRetry",
    "SDK fixture must retain agent_end.willRetry.",
  );
  requireValue(
    sdk.settlement?.agentSettled?.expectedCountPerSettledPrompt === 1 &&
      sdk.settlement?.agentSettled?.verifiedByUpstreamRegressionTest === true,
    "SDK fixture must record upstream-tested single final settlement.",
  );
  requireValue(
    sdk.settlement?.sessionShutdown?.mustNotBeCollapsedIntoAgentSettled === true,
    "Extension shutdown must remain distinct from agent_settled.",
  );
}

const rpcLines = rpcText.split("\n");
if (rpcLines.at(-1) === "") rpcLines.pop();
requireValue(rpcLines.length >= 12, "RPC fixture is unexpectedly small.");
const rpcEnvelopes = [];
for (const [index, line] of rpcLines.entries()) {
  requireValue(line.length > 0, `RPC fixture contains a blank record at line ${index + 1}.`);
  if (!line) continue;
  try {
    const envelope = JSON.parse(line);
    rpcEnvelopes.push(envelope);
    requireValue(
      envelope.origin === "source-derived-not-runtime-capture",
      `RPC fixture line ${index + 1} must declare its source-derived origin.`,
    );
    requireValue(
      ["stdin", "stdout", "framing-test"].includes(envelope.direction),
      `RPC fixture line ${index + 1} has invalid direction.`,
    );
    requireValue(
      envelope.record && typeof envelope.record === "object",
      `RPC fixture line ${index + 1} needs a record object.`,
    );
  } catch (error) {
    violations.push(`RPC fixture line ${index + 1} is invalid JSON: ${error.message}`);
  }
}

const commandsById = new Map();
const responsesById = new Map();
for (const envelope of rpcEnvelopes) {
  const record = envelope.record ?? {};
  if (envelope.direction === "stdin" && typeof record.id === "string") {
    commandsById.set(record.id, record);
  }
  if (
    envelope.direction === "stdout" &&
    record.type === "response" &&
    typeof record.id === "string"
  ) {
    responsesById.set(record.id, record);
  }
}
for (const [id, command] of commandsById) {
  const response = responsesById.get(id);
  requireValue(Boolean(response), `RPC command ${id} has no matching response.`);
  if (response) {
    requireValue(
      response.command === command.type,
      `RPC response ${id} command ${response.command} does not match ${command.type}.`,
    );
  }
}
const rpcEventTypes = new Set(
  rpcEnvelopes
    .filter((envelope) => envelope.direction === "stdout")
    .map((envelope) => envelope.record?.type),
);
for (const type of [
  "agent_start",
  "turn_start",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "turn_end",
  "agent_end",
  "agent_settled",
  "bash_execution_update",
]) {
  requireValue(rpcEventTypes.has(type), `RPC fixture is missing event ${type}.`);
}
const bashCommand = commandsById.get("bash-1");
const bashUpdate = rpcEnvelopes.find(
  (envelope) =>
    envelope.direction === "stdout" &&
    envelope.record?.type === "bash_execution_update",
);
requireValue(bashCommand?.type === "bash", "RPC fixture is missing the correlated bash command.");
requireValue(bashUpdate?.record?.id === "bash-1", "bash_execution_update must preserve the command id.");

const framingRecord = rpcEnvelopes.find((envelope) => envelope.direction === "framing-test");
requireValue(
  framingRecord?.record?.text === "a\u2028b\u2029c",
  "RPC framing fixture must preserve U+2028 and U+2029 inside one JSON record.",
);

if (baseline) {
  for (const token of [
    baseline.upstream.commit,
    baseline.package.name,
    baseline.package.version,
    "source-verified",
    "runtime-unverified",
    "toolCallId",
    "agent_settled",
    "LF-only",
  ]) {
    requireValue(report.includes(token), `Pi spike report is missing token: ${token}`);
  }
}

requireValue(
  packageJson.scripts?.["check:pi-spike"] === "node scripts/check-pi-spike.mjs",
  "package.json must expose check:pi-spike.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:pi-spike"),
  "npm run check must include check:pi-spike.",
);
requireValue(
  packageJson.scripts?.["probe:pi:sdk"] === "node scripts/probes/pi-sdk-surface.mjs",
  "package.json must expose probe:pi:sdk.",
);
requireValue(
  packageJson.scripts?.["probe:pi:rpc"] === "node scripts/probes/pi-rpc-state.mjs",
  "package.json must expose probe:pi:rpc.",
);

if (violations.length > 0) {
  console.error("Pi runtime spike violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi runtime spike fixtures: OK (${rpcEnvelopes.length} JSONL records)`);
