import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = process.cwd();
const fixturePath = "docs/harness/incidents/2026-08-11-direct-main.json";
const historicalRiskPath = "docs/harness/risk-acceptance/2026-08-11-private-free.json";
const currentRiskPath = "docs/harness/risk-acceptance/2026-08-13-public-free.json";
const rulesetPath = "docs/harness/rulesets/2026-08-13-main-public-free.json";
const proof12Path = "docs/harness/provenance-proofs/2026-08-11-pr-12.json";
const proof13Path = "docs/harness/provenance-proofs/2026-08-11-pr-13.json";
const violations = [];

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = error?.stderr?.toString?.("utf8")?.trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function commitTree(sha) {
  return git(["show", "-s", "--format=%T", sha]);
}

function commitParents(sha) {
  return git(["show", "-s", "--format=%P", sha]).split(/\s+/).filter(Boolean);
}

function commitSubject(sha) {
  return git(["show", "-s", "--format=%s", sha]);
}

function changedPaths(parent, commit) {
  return git(["diff", "--name-only", parent, commit]).split(/\r?\n/).filter(Boolean);
}

function provenanceDecision({ associatedMergedPullRequest, currentHeadMatchesAfter, treeChanged }) {
  if (associatedMergedPullRequest) return "authorized";
  if (!currentHeadMatchesAfter) return "incident-stale-no-recovery";
  if (!treeChanged) return "incident-tree-neutral-no-recovery";
  return "incident-with-draft-recovery";
}

function mergeHaltDecision({ configuredPause, configuredIncidentIssue, activeIncidentNumbers, recoveryMetadata, references }) {
  const required = new Set(activeIncidentNumbers);
  if (configuredPause && configuredIncidentIssue) required.add(configuredIncidentIssue);
  if (!configuredPause && required.size === 0) {
    return recoveryMetadata === "yes" ? "recovery-without-halt" : "ordinary-allowed";
  }
  if (recoveryMetadata !== "yes") return "halt-blocks-ordinary";
  return [...required].every((number) => references.includes(number))
    ? "recovery-allowed"
    : "recovery-missing-reference";
}

const [
  fixtureText,
  historicalRiskText,
  currentRiskText,
  configText,
  rulesetText,
  proof12Text,
  proof13Text,
  workflow,
  dispatchWorkflow,
  autoMerge,
  template,
] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(historicalRiskPath, "utf8"),
  readFile(currentRiskPath, "utf8"),
  readFile("harness.config.json", "utf8"),
  readFile(rulesetPath, "utf8"),
  readFile(proof12Path, "utf8"),
  readFile(proof13Path, "utf8"),
  readFile(".github/workflows/main-provenance.yml", "utf8"),
  readFile(".github/workflows/main-provenance-dispatch.yml", "utf8"),
  readFile(".github/workflows/autonomous-merge.yml", "utf8"),
  readFile(".github/pull_request_template.md", "utf8"),
]);
const fixture = JSON.parse(fixtureText);
const historicalRisk = JSON.parse(historicalRiskText);
const currentRisk = JSON.parse(currentRiskText);
const config = JSON.parse(configText);
const rulesetRecord = JSON.parse(rulesetText);
const proof12 = JSON.parse(proof12Text);
const proof13 = JSON.parse(proof13Text);

requireValue(fixture.schemaVersion === 2, "Incident fixture schemaVersion must be 2.");
requireValue(fixture.incidentId === "MAIN-2026-08-11-001", "Unexpected incident ID.");
requireValue(fixture.issue === 9, "Incident fixture must point to Issue #9.");
requireValue(fixture.status === "mitigated", "Incident status must remain mitigated.");
requireValue(Array.isArray(fixture.events) && fixture.events.length === 4, "Incident fixture must retain four events.");
requireValue(fixture.impact?.currentTreeRestored === true, "Incident must record the restored tree.");
for (const field of ["productCodeChanged", "secretsExposed", "userDataExposed", "databaseChanged", "releaseChanged", "historyRewritten"]) {
  requireValue(fixture.impact?.[field] === false, `Incident impact.${field} must remain false.`);
}

requireValue(fixture.serverProtection?.status === "unavailable-risk-accepted", "Server protection status must disclose accepted unavailability.");
requireValue(fixture.serverProtection?.operatingMode === "best-effort-private-free", "Incident operating mode is incorrect.");
requireValue(
  fixture.serverProtection?.riskAcceptanceRecord === historicalRiskPath,
  "Historical incident fixture must point to the historical Private + Free risk record.",
);
requireValue(fixture.serverProtection?.residualRiskAcceptedByOwner === true, "Owner residual-risk acceptance must remain explicit.");

requireValue(fixture.technicalMitigation?.status === "implemented-and-live-verified", "Technical mitigation must be live verified.");
requireValue(
  JSON.stringify(fixture.technicalMitigation?.pullRequests) === JSON.stringify([10, 11, 12, 13]),
  "Technical mitigation must identify PRs #10 through #13.",
);
for (const sha of [
  "852fd1e483bc07b8736e5da08b2f70e66544e4cf",
  "70224f51d37cce3427dc6480c2039bc98bf1ba53",
  "c05eba9f840c82d7b61494ae6bb06833d140d6c0",
  "10c963ef8bee978543dccf73047d3bd2d18baae5",
]) {
  requireValue(fixture.technicalMitigation?.mergedCommits?.includes(sha), `Mitigation is missing merged commit ${sha}.`);
}

const liveProof = fixture.technicalMitigation?.liveProof;
requireValue(liveProof?.status === "verified", "Initial incident live proof must be verified.");
requireValue(liveProof?.pullRequest === 12, "Initial live proof must identify PR #12.");
requireValue(liveProof?.record === proof12Path, "Initial live proof must point to the PR #12 proof record.");
requireValue(liveProof?.mergeCommit === "c05eba9f840c82d7b61494ae6bb06833d140d6c0", "Initial live proof merge commit is incorrect.");
requireValue(
  JSON.stringify(liveProof?.workflowRuns) === JSON.stringify({
    ci: 31498003965,
    autonomousMerge: 31498045898,
    provenanceDispatch: 31498045864,
    provenanceReceiver: 31498068302,
  }),
  "Initial live proof workflow runs are incorrect.",
);

const closure = fixture.closure;
requireValue(closure?.status === "completed", "Incident closure status must be completed.");
requireValue(closure?.pullRequest === 13, "Incident closure must identify PR #13.");
requireValue(closure?.mergeCommit === "10c963ef8bee978543dccf73047d3bd2d18baae5", "Incident closure merge commit is incorrect.");
requireValue(closure?.proofRecord === proof13Path, "Incident closure must point to the PR #13 proof record.");
requireValue(
  JSON.stringify(closure?.workflowRuns) === JSON.stringify({
    ci: 31499190699,
    autonomousMerge: 31499233718,
    provenanceDispatch: 31499233680,
    provenanceReceiver: 31499253092,
  }),
  "Incident closure workflow runs are incorrect.",
);
requireValue(closure?.issueState === "closed", "Incident issue state must be closed.");
requireValue(closure?.stateReason === "completed", "Incident issue state reason must be completed.");
requireValue(closure?.closedAt === "2026-08-11T14:03:22Z", "Incident closedAt timestamp is incorrect.");

requireValue(
  historicalRisk.schemaVersion === 1 && historicalRisk.status === "accepted",
  "Historical risk acceptance must remain accepted schema 1.",
);
requireValue(historicalRisk.operatingMode === "best-effort-private-free", "Historical risk operating mode is incorrect.");
requireValue(
  historicalRisk.repositoryVisibility === "private" && historicalRisk.githubPlan === "free",
  "Historical risk repository/plan is incorrect.",
);
requireValue(historicalRisk.ownerDecision?.keepPrivate === true, "Historical owner decision must keep the repository private.");
requireValue(historicalRisk.ownerDecision?.upgradePlan === false, "Historical owner decision must reject plan upgrade.");
requireValue(
  historicalRisk.ownerDecision?.continueAutonomousDevelopment === true,
  "Historical owner decision must continue autonomous development.",
);
requireValue(
  historicalRisk.evidence?.incidentIssue === 9 && historicalRisk.evidence?.ownerDecisionCommentId === 5253754189,
  "Historical risk acceptance evidence is incorrect.",
);
requireValue(
  historicalRisk.revisitTriggers?.includes("A second unauthorized direct-main incident occurs."),
  "Historical second-incident reassessment trigger must be preserved.",
);

requireValue(config.operatingMode === "public-free-ruleset", "Current Harness mode must be public-free-ruleset.");
requireValue(config.mainProtection?.serverEnforced === true, "Current Harness must declare server-enforced main protection.");
requireValue(
  config.mainProtection?.availability === "active-public-ruleset" &&
    config.mainProtection?.riskAcceptanceRecord === currentRiskPath &&
    config.mainProtection?.rulesetRecord === rulesetPath &&
    config.mainProtection?.rulesetId === 20776157 &&
    config.mainProtection?.adminReadbackEvidence === rulesetPath &&
    config.mainProtection?.continuousReadbackScope === "token-readable-subset" &&
    config.mainProtection?.longLivedAdminCredentialStored === false,
  "Current Harness main-protection facts are incorrect.",
);
requireValue(
  config.mainProtection?.provenanceDispatchWorkflow ===
    ".github/workflows/autonomous-merge.yml" &&
    config.mainProtection?.provenanceReconcilerWorkflow ===
      ".github/workflows/main-provenance-dispatch.yml" &&
    config.mainProtection?.provenanceDispatchMode ===
      "post-squash-immediate-with-autonomous-merge-reconciler" &&
    config.mainProtection?.provenanceIdempotencyKey === "after",
  "Current Harness provenance dispatch ownership or replay identity is incorrect.",
);
requireValue(
  currentRisk.schemaVersion === 1 &&
    currentRisk.status === "accepted" &&
    currentRisk.repositoryVisibility === "public" &&
    currentRisk.githubPlan === "free" &&
    currentRisk.operatingMode === config.operatingMode &&
    currentRisk.supersedes === historicalRiskPath,
  "Current Public + Free risk acceptance does not match the Harness.",
);
requireValue(
  currentRisk.evidence?.governanceIssue === 61 &&
    currentRisk.evidence?.rulesetRecord === rulesetPath &&
    currentRisk.evidence?.ownerAdminReadbackCapturedAt === "2026-08-13T02:45:00Z" &&
    currentRisk.ownerDecision?.changedRepositoryToPublic === true &&
    currentRisk.governanceDecision?.enableServerRuleset === true &&
    currentRisk.governanceDecision?.storeLongLivedAdminCredential === false,
  "Current Public + Free risk evidence or decision is incomplete.",
);
requireValue(
  currentRisk.mandatoryControls?.includes(
    "Repository Hygiene continuously verifies only the subset readable by its ephemeral GITHUB_TOKEN and must not claim continuous verification of administrator-only fields.",
  ) &&
    currentRisk.mandatoryControls?.includes(
      "No PAT or other long-lived administrator credential is stored for continuous governance monitoring.",
    ),
  "Current risk acceptance must preserve the token-readable monitoring boundary.",
);
requireValue(
  rulesetRecord.lastOwnerAdminVerifiedAt === "2026-08-13T02:45:00Z" &&
    rulesetRecord.ruleset?.id === 20776157 &&
    JSON.stringify(rulesetRecord.ruleset?.bypassActors) === "[]" &&
    rulesetRecord.securityAndAnalysis?.secretScanning === "enabled" &&
    rulesetRecord.securityAndAnalysis?.secretScanningPushProtection === "enabled",
  "Current Ruleset record must statically preserve the admin-captured bypass and security settings.",
);
requireValue(
  rulesetRecord.verificationBoundary?.ownerAdminLiveReadback?.capturedAt === "2026-08-13T02:45:00Z" &&
    rulesetRecord.verificationBoundary?.ownerAdminLiveReadback?.evidenceKind ===
      "versioned-owner-admin-api-readback" &&
    JSON.stringify(rulesetRecord.verificationBoundary?.ownerAdminLiveReadback?.rulesetBypassActors) === "[]" &&
    rulesetRecord.verificationBoundary?.ownerAdminLiveReadback?.securityAndAnalysis?.secretScanning === "enabled" &&
    rulesetRecord.verificationBoundary?.ownerAdminLiveReadback?.securityAndAnalysis?.secretScanningPushProtection ===
      "enabled" &&
    rulesetRecord.verificationBoundary?.continuousGithubTokenReadback?.scope === "token-readable-subset" &&
    rulesetRecord.verificationBoundary?.continuousGithubTokenReadback?.excludedAdminFields?.includes(
      "ruleset.bypass_actors",
    ) &&
    rulesetRecord.verificationBoundary?.continuousGithubTokenReadback?.excludedAdminFields?.includes(
      "repository.security_and_analysis",
    ) &&
    rulesetRecord.verificationBoundary?.longLivedAdminCredentialStored === false,
  "Current Ruleset record must separate versioned owner/admin evidence from continuous GITHUB_TOKEN readback.",
);

function verifyProof(proof, expected) {
  requireValue(proof.schemaVersion === 1 && proof.status === "verified", `${expected.label} proof must be verified schema 1.`);
  requireValue(proof.pullRequest === expected.pullRequest, `${expected.label} proof pull request is incorrect.`);
  requireValue(proof.headCommit === expected.head, `${expected.label} proof head SHA is incorrect.`);
  requireValue(proof.baseCommit === expected.base, `${expected.label} proof base SHA is incorrect.`);
  requireValue(proof.mergeCommit === expected.merge, `${expected.label} proof merge SHA is incorrect.`);
  for (const [field, runId] of Object.entries(expected.runs)) {
    requireValue(proof.canonicalChain?.[field]?.runId === runId, `${expected.label} proof ${field} run ID is incorrect.`);
    requireValue(proof.canonicalChain?.[field]?.conclusion === "success", `${expected.label} proof ${field} must be successful.`);
  }
  requireValue(proof.canonicalChain?.provenanceReceiver?.event === "repository_dispatch", `${expected.label} receiver event must be repository_dispatch.`);
  requireValue(proof.canonicalChain?.provenanceDispatch?.notice === expected.dispatchNotice, `${expected.label} dispatch notice is incorrect.`);
  requireValue(proof.canonicalChain?.provenanceReceiver?.notice === expected.receiverNotice, `${expected.label} receiver notice is incorrect.`);
}

verifyProof(proof12, {
  label: "PR #12",
  pullRequest: 12,
  head: "e1c281615c3daf8ef7116d2c57aa2ae929af08f6",
  base: "70224f51d37cce3427dc6480c2039bc98bf1ba53",
  merge: "c05eba9f840c82d7b61494ae6bb06833d140d6c0",
  runs: {
    ci: 31498003965,
    autonomousMerge: 31498045898,
    provenanceDispatch: 31498045864,
    provenanceReceiver: 31498068302,
  },
  dispatchNotice: "Dispatched Main Provenance for PR #12 at c05eba9f840c82d7b61494ae6bb06833d140d6c0.",
  receiverNotice: "Authorized main update c05eba9f840c82d7b61494ae6bb06833d140d6c0 from merged PR #12 via autonomous-merge.",
});
requireValue(proof12.additionalObservations?.duplicateSafeDispatchesObserved === true, "PR #12 duplicate safe dispatch observation must remain disclosed.");

verifyProof(proof13, {
  label: "PR #13",
  pullRequest: 13,
  head: "e4861248628d7e42e7397ac63aa542dfe1773c3a",
  base: "c05eba9f840c82d7b61494ae6bb06833d140d6c0",
  merge: "10c963ef8bee978543dccf73047d3bd2d18baae5",
  runs: {
    ci: 31499190699,
    autonomousMerge: 31499233718,
    provenanceDispatch: 31499233680,
    provenanceReceiver: 31499253092,
  },
  dispatchNotice: "Dispatched Main Provenance for PR #13 at 10c963ef8bee978543dccf73047d3bd2d18baae5.",
  receiverNotice: "Authorized main update 10c963ef8bee978543dccf73047d3bd2d18baae5 from merged PR #13 via autonomous-merge.",
});
requireValue(proof13.incidentClosure?.issue === 9, "PR #13 proof must identify Incident #9.");
requireValue(proof13.incidentClosure?.state === "closed", "PR #13 proof must record the issue as closed.");
requireValue(proof13.incidentClosure?.stateReason === "completed", "PR #13 proof must record completed state reason.");
requireValue(proof13.incidentClosure?.closedAt === "2026-08-11T14:03:22Z", "PR #13 proof closedAt is incorrect.");

try {
  git(["merge-base", "--is-ancestor", fixture.safeBaseline.commit, "HEAD"]);
} catch (error) {
  violations.push(`Safe baseline is not an ancestor of HEAD: ${error.message}`);
}
requireValue(isSha(fixture.safeBaseline?.commit), "Safe baseline commit must be a full SHA.");
requireValue(isSha(fixture.safeBaseline?.tree), "Safe baseline tree must be a full SHA.");
if (isSha(fixture.safeBaseline?.commit)) {
  requireValue(commitTree(fixture.safeBaseline.commit) === fixture.safeBaseline.tree, "Safe baseline tree differs from Git history.");
}

let expectedParent = fixture.safeBaseline.commit;
for (let index = 0; index < fixture.events.length; index += 1) {
  const event = fixture.events[index];
  const label = `Incident event ${index + 1}`;
  requireValue(event.sequence === index + 1, `${label} sequence is invalid.`);
  requireValue(isSha(event.commit) && isSha(event.parent) && isSha(event.tree), `${label} must use full SHAs.`);
  requireValue(event.parent === expectedParent, `${label} breaks the recorded first-parent chain.`);
  if (isSha(event.commit)) {
    try {
      const parents = commitParents(event.commit);
      requireValue(parents.length === 1 && parents[0] === event.parent, `${label} parent differs from Git history.`);
      requireValue(commitTree(event.commit) === event.tree, `${label} tree differs from Git history.`);
      requireValue(commitSubject(event.commit) === event.message, `${label} subject differs from Git history.`);
      if (event.classification === "unauthorized-direct-write") {
        const paths = changedPaths(event.parent, event.commit);
        requireValue(event.tree !== fixture.safeBaseline.tree, `${label} must differ from the safe tree.`);
        requireValue(paths.length === 1 && paths[0] === event.path, `${label} changed unexpected paths: ${paths.join(", ")}`);
        requireValue(event.sensitiveData === false, `${label} must record no sensitive data.`);
      } else if (event.classification === "emergency-direct-recovery") {
        requireValue(event.tree === fixture.safeBaseline.tree, `${label} must restore the safe tree.`);
        requireValue(event.restoresTree === fixture.safeBaseline.tree, `${label} restoresTree is invalid.`);
      } else {
        violations.push(`${label} has unsupported classification: ${event.classification}`);
      }
    } catch (error) {
      violations.push(`${label} could not be verified: ${error.message}`);
    }
  }
  expectedParent = event.commit;
}

for (const token of [
  "repository_dispatch:",
  "types: [main-provenance]",
  "associatedMergedPullRequest.base?.sha !== before",
  "parents.length !== 1 || parents[0].sha !== before",
  "repository_dispatch payload 不是可信的 tree 恢复来源",
  "github.rest.git.createCommit",
  "github.rest.pulls.create",
  "draft: true",
  "core.setFailed",
]) {
  requireValue(workflow.includes(token), `Main Provenance workflow is missing token: ${token}`);
}
for (const token of [
  "name: Main Provenance Dispatch",
  "workflows: [\"Autonomous Merge\"]",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "autonomousMergeRun.head_repository?.full_name !== repositoryFullName",
  "autonomousMergeRun.path !== \".github/workflows/autonomous-merge.yml\"",
  "const autonomousMergeIdentityPattern =",
  "github.rest.actions.getWorkflowRunAttempt",
  "attempt < 3",
  "async function failSourceCiReadClosed",
  "reason = \"reconciler-source-ci-undetermined\"",
  "sourceCiRun.path !== \".github/workflows/ci.yml\"",
  "sourceCiRun.conclusion !== \"success\"",
  "async function failClosed",
  "squash-parent-contract-mismatch",
  "github.rest.repos.createDispatchEvent",
  "consecutiveTrustedUnmergedReads",
  "reason: \"reconciler-merge-state-undetermined\"",
  "reason: \"provenance-reconciliation-dispatch-failed\"",
  "const ciIdentityPattern =",
  "ciReady !== \"true\"",
  "record?.status === \"open\" && record?.after === after",
]) {
  requireValue(dispatchWorkflow.includes(token), `Main Provenance reconciler is missing token: ${token}`);
}
for (const token of [
  "run-name: autonomous-merge | source_ci_run=${{ github.event.workflow_run.id }} | source_ci_attempt=${{ github.event.workflow_run.run_attempt }} | source_ci_head=${{ github.event.workflow_run.head_sha }}",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "run.path !== \".github/workflows/ci.yml\"",
  "run.head_repository?.full_name !== repositoryFullName",
  "pr.head.repo?.full_name !== repositoryFullName",
  "readTrustedJson(\"harness.config.json\")",
  "developmentPause?.active",
  "zhiwei-main-incident",
  "main-incident-recovery",
  "Recovery PR must reference every required main incident",
  "const ciIdentityPattern =",
  "ciReady !== \"true\"",
  "const expectedCiDisplayTitle =",
  "run.display_title !== expectedCiDisplayTitle",
  "async function failPostMergeClosed",
  "const after = merge.sha",
  "mergedPr.merge_commit_sha !== after",
  "mergedPr.head.sha !== run.head_sha || mergedPr.base.sha !== testedBaseSha",
  "parents.length !== 1 || parents[0].sha !== testedBaseSha",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "reason: \"provenance-dispatch-failed\"",
  "record?.status === \"open\" && record?.after === after",
]) {
  requireValue(autoMerge.includes(token), `Autonomous Merge is missing token: ${token}`);
}
for (const [name, source] of [
  ["Main Provenance", workflow],
  ["Autonomous Merge", autoMerge],
  ["Main Provenance Dispatch", dispatchWorkflow],
]) {
  requireValue(!source.includes("pull_request_target:"), `${name} must not use pull_request_target.`);
  requireValue(!/\$\{\{\s*secrets\./.test(source), `${name} must not inject repository secrets.`);
}
for (const [name, source, forbidden] of [
  ["Autonomous Merge", autoMerge, 'run.name !== "CI"'],
  ["Main Provenance reconciler", dispatchWorkflow, 'autonomousMergeRun.name !== "Autonomous Merge"'],
  ["Main Provenance reconciler", dispatchWorkflow, 'sourceCiRun.name !== "CI"'],
]) {
  requireValue(
    !source.includes(forbidden),
    `${name} must not rely on custom run-name presentation: ${forbidden}`,
  );
}
requireValue(template.includes("main-incident-recovery: no"), "PR template must default main-incident-recovery to no.");

const provenanceScenarios = [
  ["merged PR is authorized", { associatedMergedPullRequest: true, currentHeadMatchesAfter: true, treeChanged: true }, "authorized"],
  ["live direct change creates Draft recovery", { associatedMergedPullRequest: false, currentHeadMatchesAfter: true, treeChanged: true }, "incident-with-draft-recovery"],
  ["tree-neutral direct commit needs no recovery", { associatedMergedPullRequest: false, currentHeadMatchesAfter: true, treeChanged: false }, "incident-tree-neutral-no-recovery"],
  ["moved main never receives stale recovery", { associatedMergedPullRequest: false, currentHeadMatchesAfter: false, treeChanged: true }, "incident-stale-no-recovery"],
];
for (const [name, input, expected] of provenanceScenarios) {
  requireValue(provenanceDecision(input) === expected, `Provenance scenario failed: ${name}`);
}

const haltScenarios = [
  ["ordinary merge allowed after pause and incident close", { configuredPause: false, activeIncidentNumbers: [], recoveryMetadata: "no", references: [] }, "ordinary-allowed"],
  ["open incident blocks ordinary merge", { configuredPause: false, activeIncidentNumbers: [9], recoveryMetadata: "no", references: [] }, "halt-blocks-ordinary"],
  ["incident recovery needs reference", { configuredPause: false, activeIncidentNumbers: [9], recoveryMetadata: "yes", references: [] }, "recovery-missing-reference"],
  ["incident recovery with reference is allowed", { configuredPause: false, activeIncidentNumbers: [9], recoveryMetadata: "yes", references: [9] }, "recovery-allowed"],
  ["recovery metadata cannot be used without halt", { configuredPause: false, activeIncidentNumbers: [], recoveryMetadata: "yes", references: [] }, "recovery-without-halt"],
];
for (const [name, input, expected] of haltScenarios) {
  requireValue(mergeHaltDecision(input) === expected, `Merge-halt scenario failed: ${name}`);
}

if (violations.length > 0) {
  console.error("Main provenance violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Main provenance incident, historical/current risk acceptance and closure proofs: OK");
