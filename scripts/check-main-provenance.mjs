import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = process.cwd();
const fixturePath = "docs/harness/incidents/2026-08-11-direct-main.json";
const workflowPath = ".github/workflows/main-provenance.yml";
const autoMergePath = ".github/workflows/autonomous-merge.yml";
const templatePath = ".github/pull_request_template.md";
const violations = [];

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    const stderr = error?.stderr?.toString?.("utf8")?.trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function requireValue(condition, message) {
  if (!condition) violations.push(message);
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

function decision({ associatedMergedPullRequest, currentHeadMatchesAfter, beforeTree, afterTree }) {
  if (associatedMergedPullRequest) return { authorized: true, incident: false, recoveryDraft: false };
  return {
    authorized: false,
    incident: true,
    recoveryDraft: currentHeadMatchesAfter && beforeTree !== afterTree,
  };
}

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const workflow = await readFile(workflowPath, "utf8");
const autoMerge = await readFile(autoMergePath, "utf8");
const template = await readFile(templatePath, "utf8");

requireValue(fixture.schemaVersion === 1, "Incident fixture schemaVersion must be 1.");
requireValue(fixture.incidentId === "MAIN-2026-08-11-001", "Unexpected incident ID.");
requireValue(fixture.issue === 9, "Incident fixture must point to Issue #9.");
requireValue(fixture.status === "open-human-action-required", "Incident must remain open until server protection is confirmed.");
requireValue(isSha(fixture.safeBaseline?.commit), "Safe baseline commit must be a full SHA.");
requireValue(isSha(fixture.safeBaseline?.tree), "Safe baseline tree must be a full SHA.");
requireValue(Array.isArray(fixture.events) && fixture.events.length === 4, "Incident fixture must contain four ordered events.");
requireValue(fixture.serverProtection?.status === "required-owner-action", "Server protection must remain an explicit owner action.");
requireValue(
  fixture.serverProtection?.requiredRules?.includes("require pull request before merging"),
  "Server protection must require pull requests.",
);
requireValue(
  fixture.serverProtection?.requiredRules?.includes("do not grant the ChatGPT Connector a direct-push bypass"),
  "ChatGPT Connector must not receive a direct-push bypass.",
);

try {
  git(["merge-base", "--is-ancestor", fixture.safeBaseline.commit, "HEAD"]);
} catch (error) {
  violations.push(`Safe baseline is not an ancestor of HEAD: ${error.message}`);
}

if (isSha(fixture.safeBaseline.commit)) {
  requireValue(
    commitTree(fixture.safeBaseline.commit) === fixture.safeBaseline.tree,
    "Safe baseline tree differs from Git history.",
  );
}

let expectedParent = fixture.safeBaseline.commit;
for (let index = 0; index < (fixture.events ?? []).length; index += 1) {
  const event = fixture.events[index];
  const label = `Incident event ${index + 1}`;
  requireValue(event.sequence === index + 1, `${label} sequence is invalid.`);
  requireValue(isSha(event.commit), `${label} commit must be a full SHA.`);
  requireValue(isSha(event.parent), `${label} parent must be a full SHA.`);
  requireValue(isSha(event.tree), `${label} tree must be a full SHA.`);
  requireValue(event.parent === expectedParent, `${label} does not continue the recorded first-parent chain.`);

  if (!isSha(event.commit)) continue;
  try {
    const parents = commitParents(event.commit);
    requireValue(parents.length === 1 && parents[0] === event.parent, `${label} parent differs from Git history.`);
    requireValue(commitTree(event.commit) === event.tree, `${label} tree differs from Git history.`);
    requireValue(commitSubject(event.commit) === event.message, `${label} subject differs from Git history.`);

    if (event.classification === "unauthorized-direct-write") {
      requireValue(event.tree !== fixture.safeBaseline.tree, `${label} must differ from the safe tree.`);
      const paths = changedPaths(event.parent, event.commit);
      requireValue(paths.length === 1 && paths[0] === event.path, `${label} changed unexpected paths: ${paths.join(", ")}`);
      requireValue(event.sensitiveData === false, `${label} must explicitly record no sensitive data.`);
    } else if (event.classification === "emergency-direct-recovery") {
      requireValue(event.tree === fixture.safeBaseline.tree, `${label} must restore the safe tree.`);
      requireValue(event.restoresTree === fixture.safeBaseline.tree, `${label} restoresTree is invalid.`);
    } else {
      violations.push(`${label} has an unsupported classification: ${event.classification}`);
    }
  } catch (error) {
    violations.push(`${label} could not be verified: ${error.message}`);
  }
  expectedParent = event.commit;
}

requireValue(fixture.impact?.currentTreeRestored === true, "Incident must record currentTreeRestored: true.");
for (const field of ["productCodeChanged", "secretsExposed", "userDataExposed", "databaseChanged", "releaseChanged", "historyRewritten"]) {
  requireValue(fixture.impact?.[field] === false, `Incident impact.${field} must be false.`);
}

const workflowTokens = [
  "name: Main Provenance",
  "push:",
  "branches: [main]",
  "contents: write",
  "issues: write",
  "pull-requests: write",
  "listPullRequestsAssociatedWithCommit",
  "merge_commit_sha === after",
  "zhiwei-main-incident",
  "status: open",
  "github.rest.git.createCommit",
  "github.rest.git.createRef",
  "github.rest.pulls.create",
  "draft: true",
  "main-incident-recovery: yes",
  "core.setFailed",
];
for (const token of workflowTokens) {
  requireValue(workflow.includes(token), `Main provenance workflow is missing token: ${token}`);
}
requireValue(!workflow.includes("pull_request_target:"), "Main provenance workflow must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(workflow), "Main provenance workflow must not inject repository secrets.");

const autoMergeTokens = [
  "zhiwei-main-incident",
  "main-incident-recovery",
  "Active main incident",
  "Recovery PR must reference every active main incident",
];
for (const token of autoMergeTokens) {
  requireValue(autoMerge.includes(token), `Autonomous merge workflow is missing incident halt token: ${token}`);
}

requireValue(template.includes("main-incident-recovery: no"), "PR template must default main-incident-recovery to no.");

const scenarios = [
  {
    name: "merged PR is authorized",
    input: { associatedMergedPullRequest: true, currentHeadMatchesAfter: true, beforeTree: "a", afterTree: "b" },
    expected: { authorized: true, incident: false, recoveryDraft: false },
  },
  {
    name: "live direct change creates recovery draft",
    input: { associatedMergedPullRequest: false, currentHeadMatchesAfter: true, beforeTree: "a", afterTree: "b" },
    expected: { authorized: false, incident: true, recoveryDraft: true },
  },
  {
    name: "tree-neutral direct commit creates incident without recovery",
    input: { associatedMergedPullRequest: false, currentHeadMatchesAfter: true, beforeTree: "a", afterTree: "a" },
    expected: { authorized: false, incident: true, recoveryDraft: false },
  },
  {
    name: "moved main never receives a stale automatic recovery",
    input: { associatedMergedPullRequest: false, currentHeadMatchesAfter: false, beforeTree: "a", afterTree: "b" },
    expected: { authorized: false, incident: true, recoveryDraft: false },
  },
];
for (const scenario of scenarios) {
  const actual = decision(scenario.input);
  requireValue(JSON.stringify(actual) === JSON.stringify(scenario.expected), `Scenario failed: ${scenario.name}`);
}

if (violations.length > 0) {
  console.error("Main provenance violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Main provenance incident and recovery contract: OK");
