import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  runWorkItemPolicySelfTests,
  workItemPolicyScenarios,
} from "./work-item-policy.mjs";

const root = process.cwd();
const violations = [];
const policyPath = "docs/harness/work-item-lifecycle.md";
const modulePath = "scripts/work-item-policy.mjs";
const checkerPath = "scripts/check-work-item-governance.mjs";
const workflowPath = ".github/workflows/repository-hygiene.yml";
const reconciliationPath = "docs/harness/reconciliation/2026-08-12-work-item-cleanup.json";

const read = (path) => readFile(join(root, path), "utf8");
async function exists(path) {
  try {
    await stat(join(root, path));
    return true;
  } catch {
    return false;
  }
}
function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

runWorkItemPolicySelfTests();
requireValue(
  workItemPolicyScenarios().length >= 10,
  "Work item policy must retain at least ten deterministic contract scenarios.",
);

const [
  config,
  packageJson,
  policy,
  policyModule,
  checker,
  prTemplate,
  prChecker,
  ci,
  hygiene,
  rootAgents,
  harnessReadme,
  developmentLoop,
  branchLifecycle,
  projectState,
  reconciliation,
] = await Promise.all([
  read("harness.config.json").then(JSON.parse),
  read("package.json").then(JSON.parse),
  read(policyPath),
  read(modulePath),
  read(checkerPath),
  read(".github/pull_request_template.md"),
  read("scripts/check-pr-contract.mjs"),
  read(".github/workflows/ci.yml"),
  read(workflowPath),
  read("AGENTS.md"),
  read("docs/harness/README.md"),
  read("docs/harness/development-loop.md"),
  read("docs/harness/branch-lifecycle.md"),
  read("docs/harness/project-state.md"),
  read(reconciliationPath).then(JSON.parse),
]);

const scripts = packageJson.scripts ?? {};
requireValue(
  scripts["check:work-items"] === "node scripts/check-work-item-governance.mjs",
  "package.json must expose the canonical check:work-items command.",
);
requireValue(
  scripts.check?.includes("npm run check:work-items"),
  "package.json scripts.check must invoke npm run check:work-items.",
);

for (const [field, expected] of Object.entries({
  policy: policyPath,
  policyModule: modulePath,
  checker: checkerPath,
  repositoryHygieneWorkflow: workflowPath,
  reconciliationRecord: reconciliationPath,
  verifyObjectTypeBeforeWrite: true,
  preserveOwnerInputBody: true,
  requireIssueNumberInPrimaryBranch: true,
  retirementPullRequestsAllowed: false,
  maxOpenPrimaryPullRequests: 2,
})) {
  requireValue(
    config.workItemLifecycle?.[field] === expected,
    `workItemLifecycle.${field} must be ${JSON.stringify(expected)}.`,
  );
}
requireValue(
  JSON.stringify(config.workItemLifecycle?.allowedPrimaryBranchPrefixes) ===
    JSON.stringify(["feat/", "fix/", "docs/", "chore/", "spike/"]),
  "allowedPrimaryBranchPrefixes must remain the canonical five-prefix set.",
);
requireValue(
  JSON.stringify(config.workItemLifecycle?.forbiddenHelperPrefixes) ===
    JSON.stringify(["ai/", "automation/"]),
  "forbiddenHelperPrefixes must remain ai/ and automation/.",
);
requireValue(config.workItemLifecycle?.helperBranchPrefix === "helper/", "helperBranchPrefix must be helper/.");
requireValue(config.workItemLifecycle?.helperLeaseRequired === true, "helper branches must require a lease.");

for (const required of [policyPath, modulePath, checkerPath, workflowPath, reconciliationPath]) {
  requireValue(config.governanceFiles?.includes(required), `Harness governanceFiles must include ${required}.`);
  requireValue(await exists(required), `Required work item governance file is missing: ${required}.`);
}

for (const token of [
  "owner-input",
  "Issue #44",
  "Issue #58",
  "GitHub Issue 和 Pull Request 共用数字编号空间",
  "一个用户结果只能有一个 canonical execution Issue",
  "一个 execution Issue 最多一个 active branch",
  "一个 execution Issue 最多一个开放 primary PR",
  "禁止为以下目的创建额外 PR",
  "不得创建“retire branch” PR",
  "WIP 上限",
  "Repository Reconciliation",
  "helper/<work-item>/<purpose>/<expires-epoch>",
  "自动化评论必须包含可校验的 work item、PR、HEAD 或 Workflow Run",
]) {
  requireValue(policy.includes(token), `Work item lifecycle policy is missing token: ${token}`);
}

for (const token of [
  "parseHarnessMetadata",
  "parseNumberReference",
  "branchContainsWorkItem",
  "isRetirementPullRequest",
  "validatePullRequestWorkItemContract",
  "auditRepositoryWorkItems",
  "selectAllowlistedLegacyHelperBranches",
  "runWorkItemPolicySelfTests",
  "Primary PR branch",
  "retire or clean up a branch",
  "No-op or capability-test Pull Requests",
]) {
  requireValue(policyModule.includes(token), `Work item policy module is missing token: ${token}`);
}
requireValue(checker.includes("runWorkItemPolicySelfTests"), "Work item checker must execute policy self-tests.");

for (const field of ["work-item:", "pr-role:", "owner-input:", "supersedes-pr:"]) {
  requireValue(prTemplate.includes(field), `Pull request template is missing work item field: ${field}`);
  requireValue(policyModule.includes(field.replace(":", "")), `Work item policy is missing metadata field: ${field}`);
}
for (const token of [
  "GITHUB_EVENT_PATH",
  "PR_TITLE",
  "PR_HEAD_REF",
  "PR_NUMBER",
  "validatePullRequestWorkItemContract",
]) {
  requireValue(prChecker.includes(token), `PR contract checker is missing token: ${token}`);
}
for (const token of [
  "pull_request:",
  "issues: read",
  "Validate work item GitHub objects",
  "github.rest.issues.get",
  "github.rest.pulls.get",
  "workItemData.pull_request",
  "workItemData.state !== \"open\"",
  "ownerInputData.user?.login !== owner",
  "supersedesPr === currentPullRequest",
  "npm run check:pr",
  "PR_BODY:",
  "CHANGED_FILES_JSON:",
]) {
  requireValue(ci.includes(token), `CI workflow is missing pre-merge work item validation token: ${token}`);
}
requireValue(!ci.includes("pull_request_target:"), "CI must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(ci), "CI object validation must not inject repository secrets.");

for (const token of [
  "workflow_run:",
  "workflows: [\"Autonomous Merge\"]",
  "workflow_dispatch:",
  "schedule:",
  "contents: write",
  "issues: read",
  "pull-requests: read",
  "ref: ${{ github.sha }}",
  "persist-credentials: false",
  "auditRepositoryWorkItems",
  "selectAllowlistedLegacyHelperBranches",
  "runWorkItemPolicySelfTests",
  reconciliationPath,
  "github.rest.issues.get",
  "github.rest.pulls.get",
  "github.rest.git.deleteRef",
  "latestBranch.commit.sha !== candidate.headSha",
  "currentlyOpenPullRequests.length > 0",
  "core.setFailed",
]) {
  requireValue(hygiene.includes(token), `Repository Hygiene workflow is missing token: ${token}`);
}
for (const forbidden of ["pull_request_target:", "persist-credentials: true", "force: true", "github.rest.pulls.create"]) {
  requireValue(!hygiene.includes(forbidden), `Repository Hygiene workflow contains forbidden token: ${forbidden}`);
}
requireValue(!/\$\{\{\s*secrets\./.test(hygiene), "Repository Hygiene must not inject secrets.");

requireValue(reconciliation.schemaVersion === 1, "Reconciliation record schemaVersion must be 1.");
requireValue(reconciliation.status === "active", "Reconciliation record must remain active until cleanup is verified.");
requireValue(reconciliation.repository === "ntygod/zhiwei-next", "Reconciliation repository is incorrect.");
requireValue(reconciliation.governanceIssue === 57, "Reconciliation must identify Issue #57.");
requireValue(reconciliation.ownerInputIssue === 44, "Reconciliation must preserve owner-input #44.");
for (const [field, expected] of Object.entries({
  sdkRpcParity: 45,
  rpcWorkerLifecycle: 32,
  normalizedRuntimeEvent: 49,
  sqliteObservationLedger: 56,
})) {
  requireValue(reconciliation.canonicalWorkItems?.[field] === expected, `Canonical work item ${field} must be #${expected}.`);
}
for (const [branch, expectedHead, action] of [
  ["automation/finalize-cleanup-pr32", "524792b7182775ac0f30b48c0d2b8265c887b942", "delete-branch"],
  ["automation/ledger-source-export", "a0b274a8684e104a70b90b49be9adb2b25889041", "delete-branch"],
  ["spike/m0-pi-sdk-rpc-lifecycle", "d91d5f4ce27e17f867c6fb0f2f61c1e8c89ed204", "delete-branch"],
  ["feat/m0-sqlite-observation-ledger-v1", "0da4e97e5cac42add96a55285976a93afd992495", "preserve-snapshot"],
]) {
  requireValue(
    reconciliation.legacyBranches?.some((entry) =>
      entry.branch === branch && entry.expectedHead === expectedHead && entry.action === action
    ),
    `Reconciliation is missing ${action} record for ${branch}.`,
  );
}

for (const [name, document, tokens] of [
  ["root AGENTS", rootAgents, [policyPath, "owner-input", "一个 active branch", "retire branch"]],
  ["Harness README", harnessReadme, ["Work Item 生命周期", policyPath, "Repository Hygiene", "pre-merge", "owner-input"]],
  ["development loop", developmentLoop, ["Repository Reconciliation", "pre-merge", "work-item 编号", "一个 primary PR", "owner-input"]],
  ["branch lifecycle", branchLifecycle, ["retirement PR", "Repository Hygiene", "helper/", reconciliationPath]],
  ["project state", projectState, ["Issue #57", "Issue #44", "Issue #45", "Issue #56", "pre-merge", "work-item lifecycle"]],
]) {
  for (const token of tokens) requireValue(document.includes(token), `${name} is missing token: ${token}`);
}

const workflowDirectory = join(root, ".github", "workflows");
for (const entry of await readdir(workflowDirectory, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  requireValue(!/^ai[-_].*\.ya?ml$/i.test(entry.name), `Temporary AI workflow remains: ${entry.name}.`);
}
requireValue(!(await exists(".github/ai-payload")), "Temporary .github/ai-payload must not exist.");

if (violations.length > 0) {
  console.error("Work item governance violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Work item governance: OK (${workItemPolicyScenarios().length} policy scenarios)`);
