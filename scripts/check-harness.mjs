import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const violations = [];

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

const config = JSON.parse(await read("harness.config.json"));
const packageJson = JSON.parse(await read("package.json"));
const scripts = packageJson.scripts ?? {};
const riskAcceptancePath = "docs/harness/risk-acceptance/2026-08-11-private-free.json";
const riskAcceptance = JSON.parse(await read(riskAcceptancePath));

if (config.schemaVersion !== 3) violations.push("harness.config.json schemaVersion must be 3.");
if (config.mode !== "ai-primary") violations.push("Harness mode must remain ai-primary unless changed by an R3 governance decision.");
if (config.operatingMode !== "best-effort-private-free") {
  violations.push("Harness operatingMode must be best-effort-private-free.");
}
if (config.defaultBranch !== "main") violations.push("Harness defaultBranch must be main.");
if (config.humanReviewRequired !== false) violations.push("humanReviewRequired must be false for the chosen AI-primary operating model.");
if (config.pullRequestRequired !== true) violations.push("Normal autonomous work must require pull requests.");
if (config.directMainWritesAllowed !== false) violations.push("Direct main writes must remain disabled in the Harness contract.");
if (config.defaultMergeMethod !== "squash") violations.push("Default merge method must be squash.");
if (!config.branchPrefixes?.includes("recovery/")) violations.push("Harness branch prefixes must include recovery/.");

if (config.developmentPause?.active !== true) {
  violations.push("Development must remain paused until the live provenance proof is persisted.");
}
if (config.developmentPause?.reason !== "best-effort-live-proof-pending") {
  violations.push("Development pause reason must be best-effort-live-proof-pending.");
}
if (config.developmentPause?.incidentIssue !== 9) violations.push("Development pause must point to Incident #9.");
if (config.developmentPause?.allowedPullRequestMetadata?.["main-incident-recovery"] !== "yes") {
  violations.push("Development pause must only allow main-incident-recovery: yes PRs.");
}

if (config.mainProtection?.serverEnforced !== false) {
  violations.push("mainProtection.serverEnforced must remain false on the current plan.");
}
if (config.mainProtection?.availability !== "unavailable-current-plan") {
  violations.push("mainProtection.availability must be unavailable-current-plan.");
}
if (config.mainProtection?.ownerActionRequired !== false) {
  violations.push("mainProtection.ownerActionRequired must be false after the owner accepted residual risk.");
}
if (config.mainProtection?.residualRiskAccepted !== true) {
  violations.push("mainProtection.residualRiskAccepted must be true.");
}
for (const [field, expected] of Object.entries({
  riskAcceptanceRecord: riskAcceptancePath,
  instructions: "docs/harness/main-protection.md",
  provenanceWorkflow: ".github/workflows/main-provenance.yml",
  provenanceDispatchWorkflow: ".github/workflows/main-provenance-dispatch.yml",
  incidentFixture: "docs/harness/incidents/2026-08-11-direct-main.json",
})) {
  if (config.mainProtection?.[field] !== expected) {
    violations.push(`mainProtection.${field} must be ${expected}.`);
  }
}

if (riskAcceptance.schemaVersion !== 1) violations.push("Risk acceptance schemaVersion must be 1.");
if (riskAcceptance.status !== "accepted") violations.push("Risk acceptance status must be accepted.");
if (riskAcceptance.repository !== "ntygod/zhiwei-next") violations.push("Risk acceptance repository is incorrect.");
if (riskAcceptance.repositoryVisibility !== "private") violations.push("Risk acceptance must preserve private visibility.");
if (riskAcceptance.githubPlan !== "free") violations.push("Risk acceptance must identify GitHub Free.");
if (riskAcceptance.operatingMode !== config.operatingMode) {
  violations.push("Risk acceptance operating mode differs from Harness config.");
}
if (riskAcceptance.ownerDecision?.keepPrivate !== true) violations.push("Owner decision must keep the repository private.");
if (riskAcceptance.ownerDecision?.upgradePlan !== false) violations.push("Owner decision must reject a plan upgrade.");
if (riskAcceptance.ownerDecision?.removeIneffectiveRuleset !== true) {
  violations.push("Owner decision must record removal of the ineffective Ruleset.");
}
if (riskAcceptance.ownerDecision?.continueAutonomousDevelopment !== true) {
  violations.push("Owner decision must continue autonomous development.");
}
if (riskAcceptance.evidence?.incidentIssue !== 9 || riskAcceptance.evidence?.ownerDecisionCommentId !== 5253754189) {
  violations.push("Risk acceptance evidence must point to Issue #9 and the owner decision comment.");
}
if (!riskAcceptance.revisitTriggers?.includes("A second unauthorized direct-main incident occurs.")) {
  violations.push("A second direct-main incident must trigger risk reassessment.");
}

for (const risk of ["R0", "R1", "R2", "R3"]) {
  if (!config.riskLevels?.[risk]) violations.push(`Missing risk level in harness.config.json: ${risk}`);
}

for (const path of config.governanceFiles ?? []) {
  if (!(await exists(path))) violations.push(`Missing governance file declared by harness.config.json: ${path}`);
}
for (const required of [
  riskAcceptancePath,
  "docs/harness/main-protection.md",
  "docs/harness/incidents/2026-08-11-direct-main.json",
  ".github/workflows/main-provenance.yml",
  ".github/workflows/main-provenance-dispatch.yml",
  "scripts/check-main-provenance.mjs",
  "scripts/check-main-provenance-dispatch.mjs",
]) {
  if (!config.governanceFiles?.includes(required)) {
    violations.push(`Harness governanceFiles must include ${required}.`);
  }
}

for (const command of config.requiredCommands ?? []) {
  const match = /^npm run ([\w:-]+)$/.exec(command);
  if (!match) {
    violations.push(`Unsupported required command format: ${command}`);
  } else if (!(match[1] in scripts)) {
    violations.push(`Required command references missing package script: ${command}`);
  }
}

const checkScript = scripts.check ?? "";
for (const required of [
  "check:architecture",
  "check:agents",
  "check:main-provenance",
  "check:main-provenance-dispatch",
  "check:harness",
  "check:pi-artifact",
  "test",
]) {
  if (!checkScript.includes(`npm run ${required}`)) {
    violations.push(`package.json scripts.check must invoke npm run ${required}.`);
  }
}

const state = await read("docs/harness/project-state.md");
const stateBlock = /<!--\s*zhiwei-project-state([\s\S]*?)-->/.exec(state)?.[1] ?? "";
const milestone = /^milestone:\s*(\S+)\s*$/m.exec(stateBlock)?.[1];
const status = /^status:\s*(\S+)\s*$/m.exec(stateBlock)?.[1];
if (!milestone) violations.push("project-state.md is missing milestone metadata.");
if (milestone && milestone !== config.currentMilestone) {
  violations.push(`Project state milestone (${milestone}) differs from harness.config.json (${config.currentMilestone}).`);
}
if (status !== "paused-live-provenance-proof") {
  violations.push("project-state.md status must be paused-live-provenance-proof.");
}
for (const token of [
  "Issue #9",
  "best-effort-private-free",
  "best-effort-live-proof-pending",
  "Main Provenance Dispatch",
  "Main Provenance",
]) {
  if (!state.includes(token)) violations.push(`project-state.md is missing continuity token: ${token}`);
}

const prTemplate = await read(".github/pull_request_template.md");
for (const heading of ["## 目标与结果", "## 范围与非目标", "## 风险与回滚", "## 验证证据", "## 自主交付记录"]) {
  if (!prTemplate.includes(heading)) violations.push(`Pull request template is missing heading: ${heading}`);
}
if (!/<!--\s*zhiwei-harness[\s\S]*?-->/.test(prTemplate)) {
  violations.push("Pull request template is missing the zhiwei-harness metadata block.");
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
  if (!prTemplate.includes(field)) violations.push(`Pull request template metadata is missing field: ${field}`);
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
  "EVENT_NAME: ${{ github.event_name }}",
  "\"$EVENT_NAME\" == \"schedule\"",
  "pi-artifact-probe:",
  "needs.check.outputs.pi-artifact-probe == 'true'",
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
  "--mount type=bind,src=\"$BUNDLE\",dst=/probe,readonly",
  "PI_PROBE_HOST_WORKSPACE_MOUNTED=false",
]) {
  if (!ci.includes(required)) violations.push(`CI workflow is missing required Harness token: ${required}`);
}
if (ci.includes("pull_request_target:")) {
  violations.push("CI must not use pull_request_target for the third-party Artifact probe.");
}
if (/\$\{\{\s*secrets\./.test(ci)) {
  violations.push("CI must not inject repository secrets into the Pi Artifact probe workflow.");
}
const probeJobStart = ci.indexOf("  pi-artifact-probe:");
const probeJob = probeJobStart >= 0 ? ci.slice(probeJobStart) : "";
for (const required of [
  "permissions:\n      contents: read",
  "Checkout without persisted credentials",
  "Setup exact Node.js runtime for host validation",
  "Probe exact Pi npm Artifact in sandbox",
  "Upload sanitized probe evidence",
]) {
  if (!probeJob.includes(required)) violations.push(`Pi Artifact probe job is missing trust-boundary token: ${required}`);
}
if (probeJob.includes("$GITHUB_WORKSPACE") || probeJob.includes("src=\"$PWD\"")) {
  violations.push("Pi Artifact container must not mount the host repository workspace.");
}

const autoMerge = await read(".github/workflows/autonomous-merge.yml");
for (const required of [
  "workflow_run:",
  "pull-requests: write",
  "contents: write",
  "issues: read",
  "zhiwei-independent-review",
  "readTrustedJson(\"harness.config.json\")",
  "developmentPause?.active",
  "configuredIncidentIssue",
  "requiredIncidentNumbers",
  "trusted config pause",
  "zhiwei-main-incident",
  "main-incident-recovery",
  "Active main safety halt",
  "Recovery PR must reference every required main incident",
  "cannot be used when no trusted pause or active main incident exists",
  "merge_method: \"squash\"",
  "testedBaseSha",
  "pr.base.sha !== testedBaseSha",
  "pr.mergeable !== true",
  "metadata[\"independent-review\"] !== \"complete\"",
]) {
  if (!autoMerge.includes(required)) violations.push(`Autonomous merge workflow is missing required token: ${required}`);
}

const mainProvenance = await read(".github/workflows/main-provenance.yml");
for (const required of [
  "name: Main Provenance",
  "branches: [main]",
  "repository_dispatch:",
  "types: [main-provenance]",
  "contents: write",
  "issues: write",
  "pull-requests: write",
  "listPullRequestsAssociatedWithCommit",
  "associatedMergedPullRequest.base?.sha !== before",
  "parents.length !== 1 || parents[0].sha !== before",
  "repository_dispatch payload 不是可信的 tree 恢复来源",
  "github.rest.git.createCommit",
  "github.rest.pulls.create",
  "draft: true",
  "main-incident-recovery: yes",
  "core.setFailed",
]) {
  if (!mainProvenance.includes(required)) violations.push(`Main Provenance workflow is missing required token: ${required}`);
}
if (mainProvenance.includes("pull_request_target:")) {
  violations.push("Main Provenance workflow must not use pull_request_target.");
}
if (/\$\{\{\s*secrets\./.test(mainProvenance)) {
  violations.push("Main Provenance workflow must not inject repository secrets.");
}

const dispatchWorkflow = await read(".github/workflows/main-provenance-dispatch.yml");
for (const required of [
  "name: Main Provenance Dispatch",
  "workflow_run:",
  "async function failClosed",
  "squash-parent-contract-mismatch",
  "github.rest.repos.createDispatchEvent",
  "event_type: \"main-provenance\"",
  "reason: \"provenance-dispatch-failed\"",
]) {
  if (!dispatchWorkflow.includes(required)) violations.push(`Main Provenance Dispatch is missing required token: ${required}`);
}
if (dispatchWorkflow.includes("pull_request_target:")) {
  violations.push("Main Provenance Dispatch must not use pull_request_target.");
}
if (/\$\{\{\s*secrets\./.test(dispatchWorkflow)) {
  violations.push("Main Provenance Dispatch must not inject repository secrets.");
}

const protection = await read("docs/harness/main-protection.md");
for (const required of [
  "best-effort-private-free",
  "Private + GitHub Free",
  "不能",
  "pre-receive",
  "direct-push bypass",
  riskAcceptancePath,
  "再次发生未经授权的 direct-main Incident",
]) {
  if (!protection.includes(required)) violations.push(`Main protection document is missing: ${required}`);
}

const workflowDirectory = join(root, ".github", "workflows");
for (const entry of await readdir(workflowDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
  const workflow = await read(join(".github", "workflows", entry.name));
  for (const match of workflow.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
    const action = match[1];
    const ref = match[2];
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      violations.push(`Workflow ${entry.name} must pin ${action} to an immutable 40-character commit SHA, found ${ref}.`);
    }
  }
}

const rootAgents = await read("AGENTS.md");
for (const required of ["docs/harness/README.md", "docs/harness/autonomy-policy.md", "docs/harness/AGENTS.md"]) {
  if (!rootAgents.includes(required)) violations.push(`Root AGENTS.md does not disclose Harness source: ${required}`);
}
const harnessAgents = await read("docs/harness/AGENTS.md");
for (const required of [
  "禁止把 `branch: main`",
  "best-effort-private-free",
  "Main Incident 安全停机",
  "main-protection.md",
  "risk-acceptance/2026-08-11-private-free.json",
  "npm run check:main-provenance-dispatch",
]) {
  if (!harnessAgents.includes(required)) violations.push(`Harness AGENTS.md is missing incident rule: ${required}`);
}

if (violations.length > 0) {
  console.error("Harness violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Autonomous development Harness: OK (best-effort-private-free, live proof pending)");
