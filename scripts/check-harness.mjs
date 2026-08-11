import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const violations = [];
const riskPath = "docs/harness/risk-acceptance/2026-08-11-private-free.json";
const proofPath = "docs/harness/provenance-proofs/2026-08-11-pr-12.json";

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

const config = JSON.parse(await read("harness.config.json"));
const packageJson = JSON.parse(await read("package.json"));
const risk = JSON.parse(await read(riskPath));
const proof = JSON.parse(await read(proofPath));
const scripts = packageJson.scripts ?? {};

requireValue(config.schemaVersion === 3, "harness.config.json schemaVersion must be 3.");
requireValue(config.mode === "ai-primary", "Harness mode must remain ai-primary.");
requireValue(config.operatingMode === "best-effort-private-free", "Harness operatingMode must be best-effort-private-free.");
requireValue(config.defaultBranch === "main", "Harness defaultBranch must be main.");
requireValue(config.humanReviewRequired === false, "humanReviewRequired must remain false.");
requireValue(config.pullRequestRequired === true, "Normal autonomous work must require pull requests.");
requireValue(config.directMainWritesAllowed === false, "Direct main writes must remain disabled.");
requireValue(config.defaultMergeMethod === "squash", "Default merge method must be squash.");
requireValue(config.branchPrefixes?.includes("recovery/"), "Harness branch prefixes must include recovery/.");

requireValue(config.developmentPause?.active === false, "Development pause must be released after live proof.");
requireValue(config.developmentPause?.reason === null, "Released developmentPause.reason must be null.");
requireValue(config.developmentPause?.incidentIssue === null, "Released developmentPause.incidentIssue must be null.");
requireValue(
  config.developmentPause?.allowedPullRequestMetadata &&
    Object.keys(config.developmentPause.allowedPullRequestMetadata).length === 0,
  "Released development pause must not retain recovery-only metadata.",
);

for (const [field, expected] of Object.entries({
  serverEnforced: false,
  availability: "unavailable-current-plan",
  ownerActionRequired: false,
  residualRiskAccepted: true,
  riskAcceptanceRecord: riskPath,
  liveProofVerified: true,
  liveProofRecord: proofPath,
  instructions: "docs/harness/main-protection.md",
  provenanceWorkflow: ".github/workflows/main-provenance.yml",
  provenanceDispatchWorkflow: ".github/workflows/main-provenance-dispatch.yml",
  incidentFixture: "docs/harness/incidents/2026-08-11-direct-main.json",
})) {
  requireValue(config.mainProtection?.[field] === expected, `mainProtection.${field} must be ${expected}.`);
}

requireValue(risk.schemaVersion === 1 && risk.status === "accepted", "Risk acceptance must remain accepted schema 1.");
requireValue(risk.operatingMode === config.operatingMode, "Risk acceptance operating mode differs from config.");
requireValue(risk.repository === "ntygod/zhiwei-next", "Risk acceptance repository is incorrect.");
requireValue(risk.repositoryVisibility === "private" && risk.githubPlan === "free", "Risk acceptance visibility/plan is incorrect.");
requireValue(risk.ownerDecision?.keepPrivate === true, "Owner decision must keep the repository private.");
requireValue(risk.ownerDecision?.upgradePlan === false, "Owner decision must reject plan upgrade.");
requireValue(risk.ownerDecision?.removeIneffectiveRuleset === true, "Owner decision must record removal of the ineffective Ruleset.");
requireValue(risk.ownerDecision?.continueAutonomousDevelopment === true, "Owner decision must continue autonomous development.");
requireValue(risk.evidence?.incidentIssue === 9 && risk.evidence?.ownerDecisionCommentId === 5253754189, "Risk acceptance evidence is incorrect.");
requireValue(risk.revisitTriggers?.includes("A second unauthorized direct-main incident occurs."), "A second incident must trigger reassessment.");

requireValue(proof.schemaVersion === 1 && proof.status === "verified", "Live proof must be verified schema 1.");
requireValue(proof.pullRequest === 12, "Live proof must identify PR #12.");
requireValue(proof.mergeCommit === "c05eba9f840c82d7b61494ae6bb06833d140d6c0", "Live proof merge commit is incorrect.");
for (const [field, runId] of Object.entries({
  ci: 31498003965,
  autonomousMerge: 31498045898,
  provenanceDispatch: 31498045864,
  provenanceReceiver: 31498068302,
})) {
  requireValue(proof.canonicalChain?.[field]?.runId === runId, `Live proof ${field} run ID is incorrect.`);
  requireValue(proof.canonicalChain?.[field]?.conclusion === "success", `Live proof ${field} must be successful.`);
}
requireValue(proof.canonicalChain?.provenanceReceiver?.event === "repository_dispatch", "Live proof receiver event is incorrect.");
requireValue(proof.additionalObservations?.duplicateSafeDispatchesObserved === true, "Duplicate safe dispatch observation must remain disclosed.");

for (const riskLevel of ["R0", "R1", "R2", "R3"]) {
  requireValue(Boolean(config.riskLevels?.[riskLevel]), `Missing risk level: ${riskLevel}.`);
}

for (const path of config.governanceFiles ?? []) {
  requireValue(await exists(path), `Missing governance file declared by harness.config.json: ${path}`);
}
for (const required of [
  riskPath,
  proofPath,
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
requireValue(status === "active", "project-state status must be active after live proof.");
for (const token of [
  "best-effort-private-free",
  "developmentPause.active=false",
  "31498003965",
  "31498045898",
  "31498045864",
  "31498068302",
  "c05eba9f840c82d7b61494ae6bb06833d140d6c0",
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
  "if: always()",
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

const autoMerge = await read(".github/workflows/autonomous-merge.yml");
for (const required of [
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
  "async function failClosed",
  "squash-parent-contract-mismatch",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "reason: \"provenance-dispatch-failed\"",
]) {
  requireValue(dispatchWorkflow.includes(required), `Main Provenance Dispatch is missing required token: ${required}`);
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
  "best-effort-private-free",
  "Private + GitHub Free",
  "pre-receive",
  "direct-push bypass",
  riskPath,
  "再次发生未经授权的 direct-main Incident",
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
  "best-effort-private-free",
  "Main Incident 安全停机",
  riskPath.replace("docs/harness/", ""),
  "npm run check:main-provenance-dispatch",
]) {
  requireValue(harnessAgents.includes(required), `Harness AGENTS.md is missing rule: ${required}`);
}

if (violations.length > 0) {
  console.error("Harness violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Autonomous development Harness: OK (best-effort-private-free, live proof verified, active)");
