import { readFile } from "node:fs/promises";

const mainProvenancePath = ".github/workflows/main-provenance.yml";
const autonomousMergePath = ".github/workflows/autonomous-merge.yml";
const reconcilerPath = ".github/workflows/main-provenance-dispatch.yml";
const configPath = "harness.config.json";
const packagePath = "package.json";
const violations = [];

const [mainProvenance, autonomousMerge, reconciler, configText, packageText] =
  await Promise.all([
    readFile(mainProvenancePath, "utf8"),
    readFile(autonomousMergePath, "utf8"),
    readFile(reconcilerPath, "utf8"),
    readFile(configPath, "utf8"),
    readFile(packagePath, "utf8"),
  ]);
const config = JSON.parse(configText);
const packageJson = JSON.parse(packageText);

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function immediateDispatchDecision({
  mergeSucceeded,
  mergeConfirmed,
  sourceMatches,
  parentMatches,
  dispatchSucceeded,
}) {
  if (!mergeSucceeded) return "no-post-merge-duty";
  if (!mergeConfirmed) return "incident-confirmation";
  if (!sourceMatches) return "incident-source";
  if (!parentMatches) return "incident-parent";
  return dispatchSucceeded ? "dispatch" : "incident-dispatch";
}

function reconcileDecision({
  merged,
  sourceMatches,
  parentMatches,
  dispatchSucceeded,
}) {
  if (!merged) return "skip-not-merged";
  if (!sourceMatches) return "incident-source";
  if (!parentMatches) return "incident-parent";
  return dispatchSucceeded ? "reconcile-dispatch" : "incident-reconcile-dispatch";
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
  "name: Autonomous Merge",
  "run-name: autonomous-merge | source_ci_run=${{ github.event.workflow_run.id }} | source_ci_attempt=${{ github.event.workflow_run.run_attempt }} | source_ci_head=${{ github.event.workflow_run.head_sha }}",
  "contents: write",
  "pull-requests: write",
  "issues: write",
  "merge_method: \"squash\"",
  "async function failPostMergeClosed",
  "record?.status === \"open\" && record?.after === after",
  "const after = merge.sha",
  "attempt < 15",
  "lastMergedPrReadError",
  "mergedPr.merged_at && mergedPr.merge_commit_sha",
  "mergedPr.merge_commit_sha !== after",
  "mergedPr.head.sha !== run.head_sha || mergedPr.base.sha !== testedBaseSha",
  "parents.length !== 1 || parents[0].sha !== testedBaseSha",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "before: testedBaseSha",
  "after,",
  "pull_number: pullNumber",
  "source: \"autonomous-merge\"",
  "reason: \"provenance-dispatch-failed\"",
  "reason: \"post-merge-commit-read-failed\"",
  "kind: unauthorized-main-write",
  "core.setFailed",
]) {
  requireValue(autonomousMerge.includes(token), `Autonomous Merge immediate dispatch is missing token: ${token}`);
}

for (const token of [
  "name: Main Provenance Dispatch",
  "workflows: [\"Autonomous Merge\"]",
  "types: [completed]",
  "actions: read",
  "contents: write",
  "pull-requests: read",
  "issues: write",
  "github.event.workflow_run.event == 'workflow_run'",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "autonomousMergeRun.name !== \"Autonomous Merge\"",
  "autonomousMergeRun.path !== \".github/workflows/autonomous-merge.yml\"",
  "const autonomousMergeIdentityPattern =",
  "source_ci_run=([1-9][0-9]*)",
  "source_ci_attempt=([1-9][0-9]*)",
  "source_ci_head=([0-9a-f]{40})",
  "github.rest.actions.getWorkflowRunAttempt",
  "attempt < 3",
  "async function failSourceCiReadClosed",
  "autonomousMergeRun.conclusion !== \"success\"",
  "reason = \"reconciler-source-ci-undetermined\"",
  "before: ${sourceCiHead}",
  "after: ${sourceCiHead}",
  "run_id: sourceCiRunId",
  "attempt_number: sourceCiAttempt",
  "sourceCiRun.run_attempt !== sourceCiAttempt",
  "sourceCiRun.name !== \"CI\"",
  "sourceCiRun.path !== \".github/workflows/ci.yml\"",
  "sourceCiRun.conclusion !== \"success\"",
  "sourceCiRun.head_repository?.full_name !== repositoryFullName",
  "Source CI event ${sourceCiRun.event} is not a pull request; no reconciliation.",
  "Source CI conclusion ${sourceCiRun.conclusion} is not successful; no reconciliation.",
  "is not ${repositoryFullName}; no reconciliation.",
  "const ciIdentityPattern =",
  "ciReady !== \"true\"",
  "ciHeadSha !== sourceCiRun.head_sha",
  "ciRunId !== String(sourceCiRun.id)",
  "async function failClosed",
  "record?.status === \"open\" && record?.after === after",
  "attempt < 15",
  "lastPullReadError",
  "consecutiveTrustedUnmergedReads",
  "reason: \"reconciler-merge-state-undetermined\"",
  "!pr?.merged_at || !pr.merge_commit_sha",
  "pr.head.sha !== sourceCiRun.head_sha || pr.base.sha !== testedBaseSha",
  "parents.length !== 1 || parents[0].sha !== testedBaseSha",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "before: testedBaseSha",
  "after,",
  "pull_number: pullNumber",
  "source: \"autonomous-merge\"",
  "reason: \"provenance-reconciliation-dispatch-failed\"",
  "kind: unauthorized-main-write",
  "core.setFailed",
]) {
  requireValue(reconciler.includes(token), `Main Provenance reconciler is missing token: ${token}`);
}

requireValue(
  !reconciler.includes('workflows: ["CI"]'),
  "Main Provenance reconciler must not race Autonomous Merge from the CI workflow_run event.",
);
requireValue(
  !reconciler.includes('autonomousMergeRun.conclusion === "success"'),
  "A confirmed same-source merge must be idempotently reconciled even when Autonomous Merge concluded success.",
);
requireValue(
  !reconciler.includes("attempt < 45"),
  "Main Provenance reconciler must not retain the lossy 90-second post-CI merge window.",
);

for (const [name, workflow] of [
  [mainProvenancePath, mainProvenance],
  [autonomousMergePath, autonomousMerge],
  [reconcilerPath, reconciler],
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
  config.mainProtection?.provenanceDispatchWorkflow === autonomousMergePath,
  `harness.config.json mainProtection.provenanceDispatchWorkflow must be ${autonomousMergePath}.`,
);
requireValue(
  config.mainProtection?.provenanceReconcilerWorkflow === reconcilerPath,
  `harness.config.json mainProtection.provenanceReconcilerWorkflow must be ${reconcilerPath}.`,
);
requireValue(
  config.mainProtection?.provenanceDispatchMode ===
    "post-squash-immediate-with-autonomous-merge-reconciler",
  "harness.config.json must declare the durable immediate-plus-reconciler dispatch mode.",
);
requireValue(
  config.mainProtection?.provenanceIdempotencyKey === "after",
  "harness.config.json must declare after as the provenance replay identity.",
);
for (const path of [autonomousMergePath, reconcilerPath, "scripts/check-main-provenance-dispatch.mjs"]) {
  requireValue(config.governanceFiles?.includes(path), `harness.config.json governanceFiles must include ${path}.`);
}
requireValue(
  packageJson.scripts?.["check:main-provenance-dispatch"] ===
    "node scripts/check-main-provenance-dispatch.mjs",
  "package.json must expose the exact check:main-provenance-dispatch command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:main-provenance-dispatch"),
  "package.json scripts.check must run check:main-provenance-dispatch.",
);

const immediateScenarios = [
  ["merge not performed has no post-merge duty", false, true, true, true, true, "no-post-merge-duty"],
  ["merge confirmation failure opens incident", true, false, true, true, true, "incident-confirmation"],
  ["merged source mismatch opens incident", true, true, false, true, true, "incident-source"],
  ["non-linear squash opens incident", true, true, true, false, true, "incident-parent"],
  ["verified merge dispatches immediately", true, true, true, true, true, "dispatch"],
  ["dispatch failure opens incident", true, true, true, true, false, "incident-dispatch"],
];
for (const [name, mergeSucceeded, mergeConfirmed, sourceMatches, parentMatches, dispatchSucceeded, expected] of immediateScenarios) {
  const actual = immediateDispatchDecision({
    mergeSucceeded,
    mergeConfirmed,
    sourceMatches,
    parentMatches,
    dispatchSucceeded,
  });
  requireValue(actual === expected, `Immediate dispatch scenario failed: ${name}`);
}

const reconcileScenarios = [
  ["unmerged attempt is a no-op", false, true, true, true, "skip-not-merged"],
  ["merged source mismatch opens incident", true, false, true, true, "incident-source"],
  ["merged parent mismatch opens incident", true, true, false, true, "incident-parent"],
  ["successful immediate path is idempotently reconciled", true, true, true, true, "reconcile-dispatch"],
  ["cancelled post-merge run is reconciled", true, true, true, true, "reconcile-dispatch"],
  ["reconciliation dispatch failure opens incident", true, true, true, false, "incident-reconcile-dispatch"],
];
for (const [name, merged, sourceMatches, parentMatches, dispatchSucceeded, expected] of reconcileScenarios) {
  const actual = reconcileDecision({
    merged,
    sourceMatches,
    parentMatches,
    dispatchSucceeded,
  });
  requireValue(actual === expected, `Reconciliation scenario failed: ${name}`);
}

const recoveryScenarios = [
  ["untrusted dispatch never creates a recovery tree", "repository_dispatch", true, true, "incident-without-recovery"],
  ["stale push never creates recovery", "push", false, true, "incident-stale-no-recovery"],
  ["tree-neutral push needs no recovery", "push", true, false, "incident-tree-neutral-no-recovery"],
  ["live unauthorized push proposes a draft recovery", "push", true, true, "incident-with-draft-recovery"],
];
for (const [name, eventSource, currentHeadMatchesAfter, treeChanged, expected] of recoveryScenarios) {
  const actual = recoveryDecision({ eventSource, currentHeadMatchesAfter, treeChanged });
  requireValue(actual === expected, `Recovery scenario failed: ${name}`);
}

if (violations.length > 0) {
  console.error(
    "Main provenance dispatch violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("Main provenance immediate dispatch and durable reconciliation contract: OK");
