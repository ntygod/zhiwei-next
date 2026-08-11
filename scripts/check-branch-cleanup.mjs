import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  branchCleanupPolicyScenarios,
  runBranchCleanupPolicySelfTests,
} from "./branch-cleanup-policy.mjs";

const root = process.cwd();
const violations = [];

async function read(path) {
  return readFile(join(root, path), "utf8");
}

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

runBranchCleanupPolicySelfTests();
requireValue(
  branchCleanupPolicyScenarios().length >= 7,
  "Branch cleanup policy must retain the full deterministic scenario set.",
);

const config = JSON.parse(await read("harness.config.json"));
const workflow = await read(".github/workflows/branch-cleanup.yml");
const policy = await read("scripts/branch-cleanup-policy.mjs");
const lifecycle = await read("docs/harness/branch-lifecycle.md");
const harnessReadme = await read("docs/harness/README.md");

for (const [field, expected] of Object.entries({
  cleanupWorkflow: ".github/workflows/branch-cleanup.yml",
  policy: "docs/harness/branch-lifecycle.md",
  policyModule: "scripts/branch-cleanup-policy.mjs",
  checker: "scripts/check-branch-cleanup.mjs",
  deleteClosedPullRequestBranches: true,
  preserveOpenPullRequestBranches: true,
  preserveDefaultAndProtectedBranches: true,
  preserveBranchesWithoutPullRequestHistory: true,
  requireClosedPullRequestHeadMatch: true,
  revalidateBeforeDelete: true,
})) {
  requireValue(
    config.branchLifecycle?.[field] === expected,
    `branchLifecycle.${field} must be ${expected}.`,
  );
}

for (const required of [
  ".github/workflows/branch-cleanup.yml",
  "docs/harness/branch-lifecycle.md",
  "scripts/branch-cleanup-policy.mjs",
  "scripts/check-branch-cleanup.mjs",
]) {
  requireValue(
    config.governanceFiles?.includes(required),
    `Harness governanceFiles must include ${required}.`,
  );
}

for (const required of [
  "workflow_run:",
  "workflows: [\"Autonomous Merge\"]",
  "workflow_dispatch:",
  "schedule:",
  "contents: write",
  "pull-requests: read",
  "cancel-in-progress: false",
  "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
  "ref: ${{ github.sha }}",
  "persist-credentials: false",
  "actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b",
  "scripts/branch-cleanup-policy.mjs",
  "runBranchCleanupPolicySelfTests",
  "selectClosedPullRequestBranches",
  "github.rest.repos.listBranches",
  "state: \"open\"",
  "state: \"closed\"",
  "github.rest.repos.getBranch",
  "head: `${owner}:${candidate.name}`",
  "latestRepository.default_branch",
  "latestBranch.protected === true",
  "latestBranch.commit.sha !== candidate.headSha",
  "github.rest.git.deleteRef",
  "error.status === 404",
  "core.setFailed",
]) {
  requireValue(workflow.includes(required), `Branch Cleanup workflow is missing required token: ${required}`);
}

for (const forbidden of [
  "pull_request_target:",
  "github.event.workflow_run.head_sha",
  "github.event.pull_request.head.sha",
  "persist-credentials: true",
  "force: true",
]) {
  requireValue(!workflow.includes(forbidden), `Branch Cleanup workflow contains forbidden token: ${forbidden}`);
}
requireValue(
  !/\$\{\{\s*secrets\./.test(workflow),
  "Branch Cleanup workflow must not inject repository secrets.",
);

for (const required of [
  "pullRequest.head?.repo?.full_name !== repositoryFullName",
  "branchName === defaultBranch",
  "branch.protected === true",
  "openPullRequestHeadRefs.has(branchName)",
  "record.headSha === branch.commit?.sha",
  "return selected.sort",
  "closed same-repository branch is selected",
  "multiple closed PR records are stable and sorted",
  "open pull request branch is preserved",
  "reused or advanced branch is preserved",
  "default and protected branches are preserved",
  "fork and no-PR branches are preserved",
  "missing branch is idempotently ignored",
]) {
  requireValue(policy.includes(required), `Branch cleanup policy is missing required token: ${required}`);
}

for (const required of [
  "当前分支 HEAD 与该关闭 PR 记录的 `head.sha` 完全一致",
  "开放 PR",
  "protected",
  "Fork",
  "没有任何关闭 PR历史",
  "继续推进或复用",
  "重新读取",
  "404",
  "不 checkout 或执行 PR 分支代码",
  "不得通过 force-push",
]) {
  requireValue(lifecycle.includes(required), `Branch lifecycle document is missing: ${required}`);
}

for (const required of [
  "工作分支生命周期",
  "Branch Cleanup",
  "head.sha",
  "开放 PR",
  "复用",
]) {
  requireValue(harnessReadme.includes(required), `Harness README is missing branch cleanup disclosure: ${required}`);
}

if (violations.length > 0) {
  console.error("Branch cleanup violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Branch cleanup contract: OK (${branchCleanupPolicyScenarios().length} policy scenarios)`);
