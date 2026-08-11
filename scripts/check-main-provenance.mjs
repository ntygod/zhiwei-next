import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const root = process.cwd();
const fixturePath = "docs/harness/incidents/2026-08-11-direct-main.json";
const riskPath = "docs/harness/risk-acceptance/2026-08-11-private-free.json";
const proofPath = "docs/harness/provenance-proofs/2026-08-11-pr-12.json";
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

const [fixtureText, riskText, proofText, workflow, dispatchWorkflow, autoMerge, template] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(riskPath, "utf8"),
  readFile(proofPath, "utf8"),
  readFile(".github/workflows/main-provenance.yml", "utf8"),
  readFile(".github/workflows/main-provenance-dispatch.yml", "utf8"),
  readFile(".github/workflows/autonomous-merge.yml", "utf8"),
  readFile(".github/pull_request_template.md", "utf8"),
]);
const fixture = JSON.parse(fixtureText);
const risk = JSON.parse(riskText);
const proof = JSON.parse(proofText);

requireValue(fixture.schemaVersion === 2, "Incident fixture schemaVersion must be 2.");
requireValue(fixture.incidentId === "MAIN-2026-08-11-001", "Unexpected incident ID.");
requireValue(fixture.issue === 9, "Incident fixture must point to Issue #9.");
requireValue(fixture.status === "mitigated", "Incident status must be mitigated after live proof.");
requireValue(Array.isArray(fixture.events) && fixture.events.length === 4, "Incident fixture must retain four events.");
requireValue(fixture.impact?.currentTreeRestored === true, "Incident must record the restored tree.");
for (const field of ["productCodeChanged", "secretsExposed", "userDataExposed", "databaseChanged", "releaseChanged", "historyRewritten"]) {
  requireValue(fixture.impact?.[field] === false, `Incident impact.${field} must remain false.`);
}

requireValue(fixture.serverProtection?.status === "unavailable-risk-accepted", "Server protection status must disclose accepted unavailability.");
requireValue(fixture.serverProtection?.operatingMode === "best-effort-private-free", "Incident operating mode is incorrect.");
requireValue(fixture.serverProtection?.riskAcceptanceRecord === riskPath, "Incident fixture must point to the risk acceptance record.");
requireValue(fixture.serverProtection?.residualRiskAcceptedByOwner === true, "Owner residual-risk acceptance must remain explicit.");

requireValue(fixture.technicalMitigation?.status === "implemented-and-live-verified", "Technical mitigation must be live verified.");
requireValue(
  JSON.stringify(fixture.technicalMitigation?.pullRequests) === JSON.stringify([10, 11, 12]),
  "Technical mitigation must identify PRs #10, #11 and #12.",
);
for (const sha of [
  "852fd1e483bc07b8736e5da08b2f70e66544e4cf",
  "70224f51d37cce3427dc6480c2039bc98bf1ba53",
  "c05eba9f840c82d7b61494ae6bb06833d140d6c0",
]) {
  requireValue(fixture.technicalMitigation?.mergedCommits?.includes(sha), `Mitigation is missing merged commit ${sha}.`);
}
const liveProof = fixture.technicalMitigation?.liveProof;
requireValue(liveProof?.status === "verified", "Incident live proof must be verified.");
requireValue(liveProof?.pullRequest === 12, "Incident live proof must identify PR #12.");
requireValue(liveProof?.record === proofPath, "Incident live proof must point to the proof record.");
requireValue(liveProof?.mergeCommit === "c05eba9f840c82d7b61494ae6bb06833d140d6c0", "Incident live proof merge commit is incorrect.");
requireValue(
  JSON.stringify(liveProof?.workflowRuns) === JSON.stringify({
    ci: 31498003965,
    autonomousMerge: 31498045898,
    provenanceDispatch: 31498045864,
    provenanceReceiver: 31498068302,
  }),
  "Incident live proof workflow runs are incorrect.",
);
requireValue(fixture.closure?.status === "pending-final-recovery-pr-provenance", "Incident closure must wait for PR #13 post-merge proof.");
requireValue(fixture.closure?.expectedPullRequest === 13, "Incident closure must identify PR #13.");

requireValue(risk.schemaVersion === 1 && risk.status === "accepted", "Risk acceptance must remain accepted schema 1.");
requireValue(risk.operatingMode === "best-effort-private-free", "Risk acceptance operating mode is incorrect.");
requireValue(risk.repositoryVisibility === "private" && risk.githubPlan === "free", "Risk acceptance repository/plan is incorrect.");
requireValue(risk.ownerDecision?.keepPrivate === true, "Owner decision must keep the repository private.");
requireValue(risk.ownerDecision?.upgradePlan === false, "Owner decision must reject plan upgrade.");
requireValue(risk.ownerDecision?.continueAutonomousDevelopment === true, "Owner decision must continue autonomous development.");
requireValue(risk.evidence?.incidentIssue === 9 && risk.evidence?.ownerDecisionCommentId === 5253754189, "Risk acceptance evidence is incorrect.");
requireValue(risk.revisitTriggers?.includes("A second unauthorized direct-main incident occurs."), "A second incident must trigger reassessment.");

requireValue(proof.schemaVersion === 1 && proof.status === "verified", "Provenance proof must be verified schema 1.");
requireValue(proof.pullRequest === 12, "Provenance proof must identify PR #12.");
requireValue(proof.headCommit === "e1c281615c3daf8ef7116d2c57aa2ae929af08f6", "Proof head SHA is incorrect.");
requireValue(proof.baseCommit === "70224f51d37cce3427dc6480c2039bc98bf1ba53", "Proof base SHA is incorrect.");
requireValue(proof.mergeCommit === "c05eba9f840c82d7b61494ae6bb06833d140d6c0", "Proof merge SHA is incorrect.");
for (const [field, runId] of Object.entries({
  ci: 31498003965,
  autonomousMerge: 31498045898,
  provenanceDispatch: 31498045864,
  provenanceReceiver: 31498068302,
})) {
  requireValue(proof.canonicalChain?.[field]?.runId === runId, `Proof ${field} run ID is incorrect.`);
  requireValue(proof.canonicalChain?.[field]?.conclusion === "success", `Proof ${field} must be successful.`);
}
requireValue(proof.canonicalChain?.provenanceReceiver?.event === "repository_dispatch", "Receiver proof event must be repository_dispatch.");
requireValue(
  proof.canonicalChain?.provenanceDispatch?.notice ===
    "Dispatched Main Provenance for PR #12 at c05eba9f840c82d7b61494ae6bb06833d140d6c0.",
  "Dispatch proof notice is incorrect.",
);
requireValue(
  proof.canonicalChain?.provenanceReceiver?.notice ===
    "Authorized main update c05eba9f840c82d7b61494ae6bb06833d140d6c0 from merged PR #12 via autonomous-merge.",
  "Receiver proof notice is incorrect.",
);
requireValue(proof.additionalObservations?.duplicateSafeDispatchesObserved === true, "Duplicate safe dispatch observation must be disclosed.");

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
  "async function failClosed",
  "squash-parent-contract-mismatch",
  "github.rest.repos.createDispatchEvent",
  "reason: \"provenance-dispatch-failed\"",
]) {
  requireValue(dispatchWorkflow.includes(token), `Main Provenance Dispatch is missing token: ${token}`);
}
for (const token of [
  "readTrustedJson(\"harness.config.json\")",
  "developmentPause?.active",
  "zhiwei-main-incident",
  "main-incident-recovery",
  "Recovery PR must reference every required main incident",
]) {
  requireValue(autoMerge.includes(token), `Autonomous Merge is missing token: ${token}`);
}
for (const [name, source] of [
  ["Main Provenance", workflow],
  ["Main Provenance Dispatch", dispatchWorkflow],
]) {
  requireValue(!source.includes("pull_request_target:"), `${name} must not use pull_request_target.`);
  requireValue(!/\$\{\{\s*secrets\./.test(source), `${name} must not inject repository secrets.`);
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

console.log("Main provenance incident, risk acceptance and live proof: OK");
