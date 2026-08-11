import { readFile } from "node:fs/promises";

const mainProvenancePath = ".github/workflows/main-provenance.yml";
const dispatchPath = ".github/workflows/main-provenance-dispatch.yml";
const configPath = "harness.config.json";
const packagePath = "package.json";
const violations = [];

const [mainProvenance, dispatchWorkflow, configText, packageText] = await Promise.all([
  readFile(mainProvenancePath, "utf8"),
  readFile(dispatchPath, "utf8"),
  readFile(configPath, "utf8"),
  readFile(packagePath, "utf8"),
]);
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function dispatchDecision({ ciSucceeded, pullRequestEvent, merged, headMatches, baseMatches, parentMatches }) {
  if (!ciSucceeded || !pullRequestEvent) return "skip-non-candidate";
  if (!merged) return "skip-not-merged";
  if (!headMatches) return "fail-head-mismatch";
  if (!baseMatches) return "fail-base-mismatch";
  if (!parentMatches) return "fail-parent-mismatch";
  return "dispatch";
}

function recoveryDecision({ eventSource, currentHeadMatchesAfter, treeChanged }) {
  if (eventSource === "repository_dispatch") return "incident-without-recovery";
  if (!currentHeadMatchesAfter) return "incident-stale-no-recovery";
  if (!treeChanged) return "incident-tree-neutral-no-recovery";
  return "incident-with-draft-recovery";
}

for (const token of [
  "repository_dispatch:",
  "types: [main-provenance]",
  "context.eventName === \"repository_dispatch\"",
  "context.payload.client_payload",
  "context.payload.action !== \"main-provenance\"",
  "eventSource !== \"autonomous-merge\"",
  "declaredDefaultBranch !== repositoryDefaultBranch",
  "expectedPullNumber",
  "associatedMergedPullRequest.number !== expectedPullNumber",
  "associatedMergedPullRequest.base?.sha !== before",
  "parents.length !== 1 || parents[0].sha !== before",
  "repository_dispatch payload 不是可信的 tree 恢复来源",
  "via ${eventSource}",
]) {
  requireValue(mainProvenance.includes(token), `Main Provenance receiver is missing token: ${token}`);
}

for (const token of [
  "name: Main Provenance Dispatch",
  "workflow_run:",
  "workflows: [\"CI\"]",
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'pull_request'",
  "contents: write",
  "pull-requests: read",
  "issues: write",
  "attempt < 45",
  "pr.merged_at && pr.merge_commit_sha",
  "async function failClosed",
  "successful-ci-head-mismatch",
  "successful-ci-base-mismatch",
  "squash-parent-contract-mismatch",
  "parents.length !== 1 || parents[0].sha !== testedBaseSha",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "before: testedBaseSha",
  "after,",
  "pull_number: pullNumber",
  "source: \"autonomous-merge\"",
  "reason: \"provenance-dispatch-failed\"",
  "kind: unauthorized-main-write",
  "core.setFailed",
]) {
  requireValue(dispatchWorkflow.includes(token), `Main Provenance dispatcher is missing token: ${token}`);
}

for (const [name, workflow] of [
  [mainProvenancePath, mainProvenance],
  [dispatchPath, dispatchWorkflow],
]) {
  requireValue(!workflow.includes("pull_request_target:"), `${name} must not use pull_request_target.`);
  requireValue(!/\$\{\{\s*secrets\./.test(workflow), `${name} must not inject repository secrets.`);
  for (const match of workflow.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
    requireValue(
      /^[0-9a-f]{40}$/.test(match[2]),
      `${name} must pin ${match[1]} to an immutable 40-character commit SHA.`,
    );
  }
}

requireValue(
  config.mainProtection?.provenanceDispatchWorkflow === dispatchPath,
  `harness.config.json mainProtection.provenanceDispatchWorkflow must be ${dispatchPath}.`,
);
requireValue(
  config.governanceFiles?.includes(dispatchPath),
  `harness.config.json governanceFiles must include ${dispatchPath}.`,
);
requireValue(
  config.governanceFiles?.includes("scripts/check-main-provenance-dispatch.mjs"),
  "harness.config.json governanceFiles must include the dispatch check script.",
);
requireValue(
  packageJson.scripts?.["check:main-provenance-dispatch"] === "node scripts/check-main-provenance-dispatch.mjs",
  "package.json must expose the exact check:main-provenance-dispatch command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:main-provenance-dispatch"),
  "package.json scripts.check must run check:main-provenance-dispatch.",
);

const dispatchScenarios = [
  {
    name: "successful squash merge dispatches",
    input: {
      ciSucceeded: true,
      pullRequestEvent: true,
      merged: true,
      headMatches: true,
      baseMatches: true,
      parentMatches: true,
    },
    expected: "dispatch",
  },
  {
    name: "non-PR CI never dispatches",
    input: {
      ciSucceeded: true,
      pullRequestEvent: false,
      merged: true,
      headMatches: true,
      baseMatches: true,
      parentMatches: true,
    },
    expected: "skip-non-candidate",
  },
  {
    name: "eligible but unmerged PR stays silent",
    input: {
      ciSucceeded: true,
      pullRequestEvent: true,
      merged: false,
      headMatches: true,
      baseMatches: true,
      parentMatches: true,
    },
    expected: "skip-not-merged",
  },
  {
    name: "merged HEAD mismatch fails closed",
    input: {
      ciSucceeded: true,
      pullRequestEvent: true,
      merged: true,
      headMatches: false,
      baseMatches: true,
      parentMatches: true,
    },
    expected: "fail-head-mismatch",
  },
  {
    name: "merged base mismatch fails closed",
    input: {
      ciSucceeded: true,
      pullRequestEvent: true,
      merged: true,
      headMatches: true,
      baseMatches: false,
      parentMatches: true,
    },
    expected: "fail-base-mismatch",
  },
  {
    name: "non-linear merge parent fails closed",
    input: {
      ciSucceeded: true,
      pullRequestEvent: true,
      merged: true,
      headMatches: true,
      baseMatches: true,
      parentMatches: false,
    },
    expected: "fail-parent-mismatch",
  },
];
for (const scenario of dispatchScenarios) {
  const actual = dispatchDecision(scenario.input);
  requireValue(actual === scenario.expected, `Dispatch scenario failed: ${scenario.name}`);
}

const recoveryScenarios = [
  {
    name: "untrusted dispatch never creates a recovery tree",
    input: { eventSource: "repository_dispatch", currentHeadMatchesAfter: true, treeChanged: true },
    expected: "incident-without-recovery",
  },
  {
    name: "stale push never creates recovery",
    input: { eventSource: "push", currentHeadMatchesAfter: false, treeChanged: true },
    expected: "incident-stale-no-recovery",
  },
  {
    name: "tree-neutral push needs no recovery",
    input: { eventSource: "push", currentHeadMatchesAfter: true, treeChanged: false },
    expected: "incident-tree-neutral-no-recovery",
  },
  {
    name: "live unauthorized push proposes a draft recovery",
    input: { eventSource: "push", currentHeadMatchesAfter: true, treeChanged: true },
    expected: "incident-with-draft-recovery",
  },
];
for (const scenario of recoveryScenarios) {
  const actual = recoveryDecision(scenario.input);
  requireValue(actual === scenario.expected, `Recovery scenario failed: ${scenario.name}`);
}

if (violations.length > 0) {
  console.error("Main provenance dispatch violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Main provenance token-driven dispatch contract: OK");
