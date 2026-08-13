import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const violations = [];
const historicalRiskPath = "docs/harness/risk-acceptance/2026-08-11-private-free.json";
const currentRiskPath = "docs/harness/risk-acceptance/2026-08-13-public-free.json";
const rulesetPath = "docs/harness/rulesets/2026-08-13-main-public-free.json";
const proof12Path = "docs/harness/provenance-proofs/2026-08-11-pr-12.json";
const proof13Path = "docs/harness/provenance-proofs/2026-08-11-pr-13.json";

async function exists(path) {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}

async function read(path) {
  return readFile(join(root, path), "utf8");
}

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const config = JSON.parse(await read("harness.config.json"));
const packageJson = JSON.parse(await read("package.json"));
const historicalRisk = JSON.parse(await read(historicalRiskPath));
const currentRisk = JSON.parse(await read(currentRiskPath));
const rulesetRecord = JSON.parse(await read(rulesetPath));
const proof12 = JSON.parse(await read(proof12Path));
const proof13 = JSON.parse(await read(proof13Path));
const scripts = packageJson.scripts ?? {};

requireValue(config.schemaVersion === 3, "harness.config.json schemaVersion must be 3.");
requireValue(config.mode === "ai-primary", "Harness mode must remain ai-primary.");
requireValue(config.operatingMode === "public-free-ruleset", "Harness operatingMode must be public-free-ruleset.");
requireValue(config.defaultBranch === "main", "Harness defaultBranch must be main.");
requireValue(config.humanReviewRequired === false, "humanReviewRequired must remain false.");
requireValue(config.pullRequestRequired === true, "Normal autonomous work must require pull requests.");
requireValue(config.directMainWritesAllowed === false, "Direct main writes must remain disabled.");
requireValue(config.defaultMergeMethod === "squash", "Default merge method must be squash.");
requireValue(config.branchPrefixes?.includes("recovery/"), "Harness branch prefixes must include recovery/.");

requireValue(config.developmentPause?.active === false, "Development pause must remain released after incident closure.");
requireValue(config.developmentPause?.reason === null, "Released developmentPause.reason must be null.");
requireValue(config.developmentPause?.incidentIssue === null, "Released developmentPause.incidentIssue must be null.");
requireValue(
  config.developmentPause?.allowedPullRequestMetadata &&
    Object.keys(config.developmentPause.allowedPullRequestMetadata).length === 0,
  "Released development pause must not retain recovery-only metadata.",
);

for (const [field, expected] of Object.entries({
  serverEnforced: true,
  availability: "active-public-ruleset",
  ownerActionRequired: false,
  residualRiskAccepted: true,
  riskAcceptanceRecord: currentRiskPath,
  rulesetRecord: rulesetPath,
  rulesetId: 20776157,
  liveProofVerified: true,
  liveProofRecord: proof12Path,
  incidentClosureProofRecord: proof13Path,
  instructions: "docs/harness/main-protection.md",
  provenanceWorkflow: ".github/workflows/main-provenance.yml",
  provenanceDispatchWorkflow: ".github/workflows/main-provenance-dispatch.yml",
  incidentFixture: "docs/harness/incidents/2026-08-11-direct-main.json",
})) {
  requireValue(config.mainProtection?.[field] === expected, `mainProtection.${field} must be ${expected}.`);
}

requireValue(
  historicalRisk.schemaVersion === 1 && historicalRisk.status === "accepted",
  "Historical Private + Free risk acceptance must remain accepted schema 1.",
);
requireValue(historicalRisk.operatingMode === "best-effort-private-free", "Historical risk operating mode is incorrect.");
requireValue(
  historicalRisk.repositoryVisibility === "private" && historicalRisk.githubPlan === "free",
  "Historical risk visibility/plan is incorrect.",
);
requireValue(historicalRisk.ownerDecision?.keepPrivate === true, "Historical owner decision must retain keepPrivate=true.");
requireValue(historicalRisk.ownerDecision?.upgradePlan === false, "Historical owner decision must retain upgradePlan=false.");
requireValue(
  historicalRisk.ownerDecision?.removeIneffectiveRuleset === true,
  "Historical owner decision must retain removal of the ineffective Ruleset.",
);
requireValue(
  historicalRisk.ownerDecision?.continueAutonomousDevelopment === true,
  "Historical owner decision must retain continued autonomous development.",
);
requireValue(
  historicalRisk.evidence?.incidentIssue === 9 && historicalRisk.evidence?.ownerDecisionCommentId === 5253754189,
  "Historical risk acceptance evidence is incorrect.",
);

requireValue(
  currentRisk.schemaVersion === 1 && currentRisk.status === "accepted",
  "Current Public + Free risk acceptance must be accepted schema 1.",
);
requireValue(currentRisk.decisionId === "RISK-MAIN-PUBLIC-FREE-2026-08-13", "Current risk decision ID is incorrect.");
requireValue(
  currentRisk.decidedBy === "repository-owner-visibility-change-and-autonomous-governance",
  "Current risk decision attribution is incorrect.",
);
requireValue(currentRisk.repository === "ntygod/zhiwei-next", "Current risk repository is incorrect.");
requireValue(
  currentRisk.repositoryVisibility === "public" && currentRisk.githubPlan === "free",
  "Current risk visibility/plan must be Public + Free.",
);
requireValue(currentRisk.operatingMode === config.operatingMode, "Current risk operating mode differs from config.");
requireValue(currentRisk.supersedes === historicalRiskPath, "Current risk must supersede the historical Private + Free record.");
requireValue(
  currentRisk.evidence?.governanceIssue === 61 &&
    currentRisk.evidence?.ownerChangedRepositoryToPublic === true &&
    currentRisk.evidence?.ownerRequestedContinuedDevelopment === true &&
    currentRisk.evidence?.rulesetRecord === rulesetPath,
  "Current risk acceptance evidence is incorrect.",
);
requireValue(
  currentRisk.ownerDecision?.changedRepositoryToPublic === true &&
    currentRisk.ownerDecision?.keepPublic === true &&
    currentRisk.ownerDecision?.upgradePlanRequested === false &&
    currentRisk.ownerDecision?.continueAutonomousDevelopment === true,
  "Current Public + Free owner decision is incomplete.",
);
requireValue(
  currentRisk.governanceDecision?.keepCurrentFreePlan === true &&
    currentRisk.governanceDecision?.enableServerRuleset === true &&
    currentRisk.governanceDecision?.restrictActionsToPinnedGitHubOwnedActions === true &&
    currentRisk.governanceDecision?.enableSecretScanningAndPushProtection === true,
  "Current autonomous governance decision is incomplete.",
);
for (const control of [
  "The active default-branch ruleset has no bypass actors.",
  "Pull request workflows execute untrusted fork code with read-only tokens and no repository secrets.",
  "External-fork pull requests are never autonomously merged; token-bearing workflow_run jobs require a same-repository source.",
  "Token-bearing provenance jobs never execute fork-controlled code.",
  "Secret scanning and push protection remain enabled while validity checks stay disabled unless a later risk review authorizes issuer verification side effects.",
  "Probe artifacts are uploaded only after both capture and sanitization checks succeed; failure JSON is not public evidence.",
]) {
  requireValue(currentRisk.mandatoryControls?.includes(control), `Current risk acceptance is missing mandatory control: ${control}`);
}
requireValue(
  currentRisk.revisitTriggers?.includes("The active ruleset is disabled, deleted, bypassed, or materially modified."),
  "Ruleset drift must trigger current risk reassessment.",
);

requireValue(
  rulesetRecord.schemaVersion === 1 && rulesetRecord.status === "active-verified",
  "Ruleset record must be active-verified schema 1.",
);
requireValue(
  rulesetRecord.repository === "ntygod/zhiwei-next" &&
    rulesetRecord.repositoryVisibility === "public" &&
    rulesetRecord.githubPlan === "free" &&
    rulesetRecord.governanceIssue === 61,
  "Ruleset record repository, plan or governance issue is incorrect.",
);
requireValue(
  rulesetRecord.preChangeEvidence?.rulesetCount === 0 && rulesetRecord.preChangeEvidence?.mainProtected === false,
  "Ruleset pre-change evidence is incorrect.",
);
for (const [field, expected] of Object.entries({
  id: 20776157,
  name: "Protect main (public-free)",
  target: "branch",
  sourceType: "Repository",
  source: "ntygod/zhiwei-next",
  enforcement: "active",
})) {
  requireValue(rulesetRecord.ruleset?.[field] === expected, `Ruleset ${field} must be ${expected}.`);
}
requireValue(jsonEqual(rulesetRecord.ruleset?.bypassActors, []), "Ruleset bypassActors must be empty.");
requireValue(
  jsonEqual(rulesetRecord.ruleset?.conditions, {
    refName: { include: ["~DEFAULT_BRANCH"], exclude: [] },
  }),
  "Ruleset must target only the default branch.",
);
requireValue(
  jsonEqual(rulesetRecord.ruleset?.rules, [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "required_linear_history" },
    {
      type: "pull_request",
      parameters: {
        allowedMergeMethods: ["squash"],
        dismissStaleReviewsOnPush: false,
        requireCodeOwnerReview: false,
        requireLastPushApproval: false,
        requiredApprovingReviewCount: 0,
        requiredReviewThreadResolution: true,
      },
    },
    {
      type: "required_status_checks",
      parameters: {
        doNotEnforceOnCreate: false,
        strictRequiredStatusChecksPolicy: true,
        requiredStatusChecks: [{ context: "check", integrationId: 15368, integrationSlug: "github-actions" }],
      },
    },
  ]),
  "Ruleset rules or parameters differ from the exact approved configuration.",
);
requireValue(
  jsonEqual(rulesetRecord.liveReadback, {
    rulesetApiStatus: 200,
    activeRulesApiStatus: 200,
    mainProtected: true,
    currentUserCanBypass: "never",
    activeRuleTypes: ["deletion", "non_fast_forward", "required_linear_history", "pull_request", "required_status_checks"],
  }),
  "Ruleset live readback is incomplete or incorrect.",
);
requireValue(
  jsonEqual(rulesetRecord.actionsSecurity, {
    enabled: true,
    allowedActions: "selected",
    shaPinningRequired: true,
    githubOwnedAllowed: true,
    verifiedAllowed: false,
    patternsAllowed: [],
    forkPullRequestApprovalPolicy: "all_external_contributors",
    defaultWorkflowPermissions: "read",
    actionsCanApprovePullRequestReviews: false,
  }),
  "Actions security settings differ from the approved Public repository boundary.",
);
requireValue(
  jsonEqual(rulesetRecord.repositoryMergeSettings, {
    allowMergeCommit: false,
    allowSquashMerge: true,
    allowRebaseMerge: false,
  }),
  "Repository merge settings must allow squash only.",
);
requireValue(
  jsonEqual(rulesetRecord.securityAndAnalysis, {
    secretScanning: "enabled",
    secretScanningPushProtection: "enabled",
    validityChecks: "disabled",
    validityChecksReason:
      "Credential issuer verification can create an external network side effect and is outside this minimal governance change.",
  }),
  "Secret scanning, push protection or validity-check decision differs from the approved record.",
);
requireValue(
  rulesetRecord.publicSurfaceAudit?.directCollaborators?.length === 1 &&
    rulesetRecord.publicSurfaceAudit.directCollaborators[0] === "ntygod" &&
    rulesetRecord.publicSurfaceAudit?.deployKeys === 0 &&
    rulesetRecord.publicSurfaceAudit?.actionsSecrets === 0 &&
    rulesetRecord.publicSurfaceAudit?.actionsVariables === 0 &&
    rulesetRecord.publicSurfaceAudit?.environments === 0 &&
    rulesetRecord.publicSurfaceAudit?.selfHostedRunners === 0 &&
    rulesetRecord.publicSurfaceAudit?.deployments === 0 &&
    rulesetRecord.publicSurfaceAudit?.releases === 0 &&
    rulesetRecord.publicSurfaceAudit?.actionsArtifactsApiTotalCount === 610 &&
    rulesetRecord.publicSurfaceAudit?.artifactByteAuditPerformed === false,
  "Public surface audit must retain its measured access and artifact boundary.",
);

function verifyProof(proof, expected) {
  requireValue(proof.schemaVersion === 1 && proof.status === "verified", `${expected.label} proof must be verified schema 1.`);
  requireValue(proof.pullRequest === expected.pullRequest, `${expected.label} proof pull request is incorrect.`);
  requireValue(proof.mergeCommit === expected.mergeCommit, `${expected.label} proof merge commit is incorrect.`);
  for (const [field, runId] of Object.entries(expected.runs)) {
    requireValue(proof.canonicalChain?.[field]?.runId === runId, `${expected.label} proof ${field} run ID is incorrect.`);
    requireValue(proof.canonicalChain?.[field]?.conclusion === "success", `${expected.label} proof ${field} must be successful.`);
  }
  requireValue(proof.canonicalChain?.provenanceReceiver?.event === "repository_dispatch", `${expected.label} receiver event is incorrect.`);
}

verifyProof(proof12, {
  label: "PR #12",
  pullRequest: 12,
  mergeCommit: "c05eba9f840c82d7b61494ae6bb06833d140d6c0",
  runs: {
    ci: 31498003965,
    autonomousMerge: 31498045898,
    provenanceDispatch: 31498045864,
    provenanceReceiver: 31498068302,
  },
});
requireValue(proof12.additionalObservations?.duplicateSafeDispatchesObserved === true, "PR #12 duplicate safe dispatch observation must remain disclosed.");

verifyProof(proof13, {
  label: "PR #13",
  pullRequest: 13,
  mergeCommit: "10c963ef8bee978543dccf73047d3bd2d18baae5",
  runs: {
    ci: 31499190699,
    autonomousMerge: 31499233718,
    provenanceDispatch: 31499233680,
    provenanceReceiver: 31499253092,
  },
});
requireValue(proof13.incidentClosure?.issue === 9, "PR #13 proof must identify Incident #9.");
requireValue(proof13.incidentClosure?.state === "closed", "PR #13 proof must record the issue as closed.");
requireValue(proof13.incidentClosure?.stateReason === "completed", "PR #13 proof must record completed state reason.");
requireValue(proof13.incidentClosure?.closedAt === "2026-08-11T14:03:22Z", "PR #13 proof closedAt is incorrect.");

for (const riskLevel of ["R0", "R1", "R2", "R3"]) {
  requireValue(Boolean(config.riskLevels?.[riskLevel]), `Missing risk level: ${riskLevel}.`);
}

for (const path of config.governanceFiles ?? []) {
  requireValue(await exists(path), `Missing governance file declared by harness.config.json: ${path}`);
}
for (const required of [
  historicalRiskPath,
  currentRiskPath,
  rulesetPath,
  proof12Path,
  proof13Path,
  "docs/harness/main-protection.md",
  "docs/harness/incidents/2026-08-11-direct-main.json",
  ".github/workflows/main-provenance.yml",
  ".github/workflows/main-provenance-dispatch.yml",
  "scripts/check-main-provenance.mjs",
  "scripts/check-main-provenance-dispatch.mjs",
]) {
  requireValue(config.governanceFiles?.includes(required), `Harness governanceFiles must include ${required}.`);
}

for (const command of config.requiredCommands ?? []) {
  const match = /^npm run ([\w:-]+)$/.exec(command);
  requireValue(Boolean(match), `Unsupported required command format: ${command}`);
  if (match) requireValue(match[1] in scripts, `Required command references missing package script: ${command}`);
}

const checkScript = scripts.check ?? "";
for (const required of [
  "check:architecture",
  "check:agents",
  "check:main-provenance",
  "check:main-provenance-dispatch",
  "check:harness",
  "check:pi-spike",
  "check:pi-artifact",
  "test",
]) {
  requireValue(checkScript.includes(`npm run ${required}`), `package.json scripts.check must invoke npm run ${required}.`);
}

const state = await read("docs/harness/project-state.md");
const stateBlock = /<!--\s*zhiwei-project-state([\s\S]*?)-->/.exec(state)?.[1] ?? "";
const milestone = /^milestone:\s*(\S+)\s*$/m.exec(stateBlock)?.[1];
const status = /^status:\s*(\S+)\s*$/m.exec(stateBlock)?.[1];
requireValue(milestone === config.currentMilestone, "project-state milestone differs from Harness config.");
requireValue(status === "active", "project-state status must be active after incident closure.");
for (const token of [
  "public-free-ruleset",
  "Public + GitHub Free",
  "Ruleset `20776157`",
  "best-effort-private-free",
  "developmentPause.active=false",
  "Issue #9 已关闭",
  "PR #60已合并",
  "Issue #61",
  "Issue #32",
  "31498003965",
  "31498045898",
  "31498045864",
  "31498068302",
  "31499190699",
  "31499233718",
  "31499233680",
  "31499253092",
  "10c963ef8bee978543dccf73047d3bd2d18baae5",
  proof12Path,
  proof13Path,
  "Pi SDK / Extension",
]) {
  requireValue(state.includes(token), `project-state.md is missing continuity token: ${token}`);
}

const prTemplate = await read(".github/pull_request_template.md");
for (const heading of ["## 目标与结果", "## 范围与非目标", "## 风险与回滚", "## 验证证据", "## 自主交付记录"]) {
  requireValue(prTemplate.includes(heading), `Pull request template is missing heading: ${heading}`);
}
for (const field of [
  "risk:",
  "autonomous-merge:",
  "independent-review:",
  "governance-change:",
  "project-state:",
  "rollback:",
  "main-incident-recovery:",
]) {
  requireValue(prTemplate.includes(field), `Pull request template metadata is missing field: ${field}`);
}

const ci = await read(".github/workflows/ci.yml");
for (const required of [
  "pull_request:",
  "edited",
  "fetch-depth: 0",
  "npm run check",
  "npm run check:pr",
  "run_pi_artifact_probe:",
  "schedule:",
  "pi-artifact-probe:",
  "persist-credentials: false",
  "node-version: 22.23.1",
  "node scripts/probes/pi-artifact-ci.mjs",
  "scripts/check-pi-artifact-result.mjs",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "if: success()",
  "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  "--read-only",
  "--user=1000:1000",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "PI_PROBE_HOST_WORKSPACE_MOUNTED=false",
]) {
  requireValue(ci.includes(required), `CI workflow is missing required token: ${required}`);
}
requireValue(!ci.includes("pull_request_target:"), "CI must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(ci), "CI must not inject repository secrets into the Pi Artifact probe.");
requireValue(!ci.includes("if: always()"), "CI must never upload failed or unvalidated probe output with if: always().");

for (const workflowPath of [
  ".github/workflows/pi-compaction-session-replacement.yml",
  ".github/workflows/pi-parallel-tool-ordering.yml",
]) {
  const workflow = await read(workflowPath);
  requireValue(workflow.includes("if: success()"), `${workflowPath} must upload evidence only after successful validation.`);
  requireValue(!workflow.includes("if: always()"), `${workflowPath} must not upload failed or unvalidated probe output.`);
}

const autoMerge = await read(".github/workflows/autonomous-merge.yml");
for (const required of [
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "run.head_repository?.full_name !== repositoryFullName",
  "pr.head.repo?.full_name !== repositoryFullName",
  "readTrustedJson(\"harness.config.json\")",
  "developmentPause?.active",
  "configuredIncidentIssue",
  "requiredIncidentNumbers",
  "zhiwei-main-incident",
  "main-incident-recovery",
  "Recovery PR must reference every required main incident",
  "merge_method: \"squash\"",
  "pr.base.sha !== testedBaseSha",
  "metadata[\"independent-review\"] !== \"complete\"",
]) {
  requireValue(autoMerge.includes(required), `Autonomous Merge is missing required token: ${required}`);
}

const mainProvenance = await read(".github/workflows/main-provenance.yml");
for (const required of [
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
  requireValue(mainProvenance.includes(required), `Main Provenance is missing required token: ${required}`);
}

const dispatchWorkflow = await read(".github/workflows/main-provenance-dispatch.yml");
for (const required of [
  "workflow_run:",
  "github.event.workflow_run.head_repository.full_name == github.repository",
  "run.head_repository?.full_name !== repositoryFullName",
  "async function failClosed",
  "squash-parent-contract-mismatch",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "reason: \"provenance-dispatch-failed\"",
]) {
  requireValue(dispatchWorkflow.includes(required), `Main Provenance Dispatch is missing required token: ${required}`);
}

const repositoryHygiene = await read(".github/workflows/repository-hygiene.yml");
for (const required of [
  "auditMainProtection",
  "repository.visibility === \"public\"",
  "mainBranch.protected === true",
  '"GET /repos/{owner}/{repo}/rulesets/{ruleset_id}"',
  "liveRuleset.current_user_can_bypass === \"never\"",
  "repository.allow_merge_commit ===",
  "repository.security_and_analysis?.secret_scanning?.status ===",
  "Live required-status Ruleset parameters drifted from the record.",
]) {
  requireValue(repositoryHygiene.includes(required), `Repository Hygiene is missing Public Ruleset audit token: ${required}`);
}

for (const [name, workflow] of [
  ["CI", ci],
  ["Main Provenance", mainProvenance],
  ["Main Provenance Dispatch", dispatchWorkflow],
]) {
  requireValue(!workflow.includes("pull_request_target:"), `${name} must not use pull_request_target.`);
  requireValue(!/\$\{\{\s*secrets\./.test(workflow), `${name} must not inject repository secrets.`);
}

const protection = await read("docs/harness/main-protection.md");
for (const required of [
  "public-free-ruleset",
  "Public + GitHub Free",
  "Ruleset `20776157`",
  "pre-receive",
  "Bypass actors",
  "Fork 与 Token 边界",
  currentRiskPath,
  historicalRiskPath,
  rulesetPath,
  "在 active Ruleset下仍发生未经授权的 direct-main更新",
]) {
  requireValue(protection.includes(required), `Main protection document is missing: ${required}`);
}

const workflowDirectory = join(root, ".github", "workflows");
for (const entry of await readdir(workflowDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
  const workflow = await read(join(".github", "workflows", entry.name));
  for (const match of workflow.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
    requireValue(
      /^[0-9a-f]{40}$/.test(match[2]),
      `Workflow ${entry.name} must pin ${match[1]} to an immutable 40-character commit SHA, found ${match[2]}.`,
    );
  }
}

const rootAgents = await read("AGENTS.md");
for (const required of ["docs/harness/README.md", "docs/harness/autonomy-policy.md", "docs/harness/AGENTS.md"]) {
  requireValue(rootAgents.includes(required), `Root AGENTS.md does not disclose Harness source: ${required}`);
}
const harnessAgents = await read("docs/harness/AGENTS.md");
for (const required of [
  "禁止把 `branch: main`",
  "public-free-ruleset",
  "Main Incident 安全停机",
  currentRiskPath.replace("docs/harness/", ""),
  rulesetPath.replace("docs/harness/", ""),
  "npm run check:main-provenance-dispatch",
]) {
  requireValue(harnessAgents.includes(required), `Harness AGENTS.md is missing rule: ${required}`);
}

if (violations.length > 0) {
  console.error("Harness violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Autonomous development Harness: OK (public-free-ruleset, server protected, incident closed, active)");
