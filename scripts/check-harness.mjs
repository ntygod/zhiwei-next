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

if (config.schemaVersion !== 1) violations.push("harness.config.json schemaVersion must be 1.");
if (config.mode !== "ai-primary") violations.push("Harness mode must remain ai-primary unless changed by an R3 governance decision.");
if (config.humanReviewRequired !== false) violations.push("humanReviewRequired must be false for the chosen AI-primary operating model.");
if (config.pullRequestRequired !== true) violations.push("Normal autonomous work must require pull requests.");
if (config.directMainWritesAllowed !== false) violations.push("Direct main writes must remain disabled in the Harness contract.");
if (config.defaultMergeMethod !== "squash") violations.push("Default merge method must be squash.");

for (const risk of ["R0", "R1", "R2", "R3"]) {
  if (!config.riskLevels?.[risk]) violations.push(`Missing risk level in harness.config.json: ${risk}`);
}

for (const path of config.governanceFiles ?? []) {
  if (!(await exists(path))) violations.push(`Missing governance file declared by harness.config.json: ${path}`);
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
for (const required of ["check:architecture", "check:agents", "check:harness", "test"]) {
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
if (!status) violations.push("project-state.md is missing status metadata.");

const prTemplate = await read(".github/pull_request_template.md");
for (const heading of ["## 目标与结果", "## 范围与非目标", "## 风险与回滚", "## 验证证据", "## 自主交付记录"]) {
  if (!prTemplate.includes(heading)) violations.push(`Pull request template is missing heading: ${heading}`);
}
if (!/<!--\s*zhiwei-harness[\s\S]*?-->/.test(prTemplate)) {
  violations.push("Pull request template is missing the zhiwei-harness metadata block.");
}
for (const field of ["risk:", "autonomous-merge:", "independent-review:", "governance-change:", "project-state:", "rollback:"]) {
  if (!prTemplate.includes(field)) violations.push(`Pull request template metadata is missing field: ${field}`);
}

const ci = await read(".github/workflows/ci.yml");
for (const required of ["pull_request:", "edited", "npm run check", "npm run check:pr"]) {
  if (!ci.includes(required)) violations.push(`CI workflow is missing required Harness token: ${required}`);
}

const autoMerge = await read(".github/workflows/autonomous-merge.yml");
for (const required of [
  "workflow_run:",
  "pull-requests: write",
  "contents: write",
  "zhiwei-independent-review",
  "merge_method: \"squash\"",
  "context.payload.repository.default_branch",
  "testedBaseSha",
  "pr.base.sha !== testedBaseSha",
  "pr.mergeable !== true",
  "metadata[\"independent-review\"] !== \"complete\"",
]) {
  if (!autoMerge.includes(required)) violations.push(`Autonomous merge workflow is missing required token: ${required}`);
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

if (violations.length > 0) {
  console.error("Harness violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Autonomous development Harness: OK");
