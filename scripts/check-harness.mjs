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

function readWorkflowJobs(workflow) {
  const jobsMarker = workflow.match(/^jobs:\s*$/m);
  if (!jobsMarker || jobsMarker.index === undefined) return new Map();
  const jobsSource = workflow.slice(jobsMarker.index + jobsMarker[0].length);
  const matches = [...jobsSource.matchAll(/^  ([a-z0-9-]+):\s*$/gm)];
  return new Map(
    matches.map((match, index) => [
      match[1],
      jobsSource.slice(
        match.index,
        index + 1 < matches.length ? matches[index + 1].index : jobsSource.length,
      ),
    ]),
  );
}

function readListNeeds(jobBlock) {
  const match = jobBlock.match(/^    needs:\s*\n((?:      - [a-z0-9-]+\s*\n)+)/m);
  return match
    ? [...match[1].matchAll(/^      - ([a-z0-9-]+)\s*$/gm)].map((item) => item[1])
    : [];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJavaScriptStringArray(source, variableName) {
  const match = source.match(
    new RegExp(`const ${escapeRegExp(variableName)} = \\[([\\s\\S]*?)\\n\\s*\\];`),
  );
  if (!match) return null;
  const values = [...match[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map(
    (item) => JSON.parse(item[0]),
  );
  const residue = match[1]
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, "")
    .replace(/[\s,]/g, "");
  return residue === "" ? values : null;
}

function readWorkflowTriggerBlock(workflow, trigger) {
  const match = workflow.match(new RegExp(`^  ${escapeRegExp(trigger)}:\\s*$`, "m"));
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const remainder = workflow.slice(start);
  const endMatch = remainder.match(/^(?:  [a-z_]+:|[^ \n][^\n]*:)\s*$/m);
  return remainder.slice(0, endMatch?.index ?? remainder.length);
}

function readInlineYamlList(block, field) {
  const match = block.match(
    new RegExp(`^    ${escapeRegExp(field)}: \\[([^\\]]*)\\]\\s*$`, "m"),
  );
  return match
    ? match[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

function readYamlList(block, field) {
  const match = block.match(
    new RegExp(`^    ${escapeRegExp(field)}:\\s*\\n((?:      - [^\\n]+\\n?)+)`, "m"),
  );
  return match
    ? [...match[1].matchAll(/^      - ([^\n]+)\s*$/gm)].map((item) => item[1])
    : [];
}

function readYamlMapping(block, field) {
  const match = block.match(
    new RegExp(
      `^    ${escapeRegExp(field)}:\\s*\\n((?:      [a-z-]+: [^\\n]+\\n?)+)`,
      "m",
    ),
  );
  return match
    ? Object.fromEntries(
        [...match[1].matchAll(/^      ([a-z-]+): ([^\n]+)\s*$/gm)].map(
          (item) => [item[1], item[2]],
        ),
      )
    : {};
}

function gatedCiResultAllowed(required, result) {
  return (required === "true" && result === "success") ||
    (required === "false" && result === "skipped");
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
  adminReadbackEvidence: rulesetPath,
  continuousReadbackScope: "token-readable-subset",
  longLivedAdminCredentialStored: false,
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

const expectedRequiredStatusCheck = {
  context: "check",
  integrationId: 15368,
  workflow: ".github/workflows/ci.yml",
  aggregatorJob: "check",
  aggregatorJobName: "check",
  aggregatorNeeds: [],
  aggregatorPermissions: { actions: "read" },
  aggregatorCheckoutAllowed: false,
  aggregatorTimeoutMinutes: 75,
  aggregatorPollDeadlineMinutes: 70,
  aggregatorPollIntervalSeconds: 60,
  aggregatorCurrentRunId: "github.run_id",
  aggregatorCurrentRunAttempt: "github.run_attempt",
  aggregatorAttemptScoped: true,
  aggregatorPriorAttemptReuseAllowed: false,
  aggregatorRerunRecovery: "re-run-all-jobs",
  workflowRunNamePrefix: "ci",
  workflowRunNameFields: [
    "event",
    "pr",
    "action",
    "updated_at",
    "ready",
    "base",
    "head",
    "run",
  ],
  workflowRunIdentityApi: "getWorkflowRunAttempt",
  evidenceJobsApi: "listJobsForWorkflowRunAttempt",
  evidenceJob: "ci-required-evidence",
  evidenceJobName: "CI required evidence",
  evidenceJobTimeoutMinutes: 35,
  staticContractsJob: "static-contracts",
  scope: "ci-five-gated-jobs-plus-three-path-gated-standalone-runs",
  staticContractsRequiredResult: "success",
  evidenceNeeds: [
    "static-contracts",
    "pi-artifact-probe",
    "pi-lifecycle-probe",
    "pi-retry-lifecycle-probe",
    "pi-follow-up-lifecycle-probe",
    "pi-cancel-retry-exhaustion-probe",
  ],
  gatedJobs: {
    "pi-artifact-probe": "pi-artifact-probe",
    "pi-lifecycle-probe": "pi-lifecycle-probe",
    "pi-retry-lifecycle-probe": "pi-lifecycle-probe",
    "pi-follow-up-lifecycle-probe": "pi-lifecycle-probe",
    "pi-cancel-retry-exhaustion-probe": "pi-lifecycle-probe",
  },
  allowedGatedResults: [
    { required: "true", result: "success" },
    { required: "false", result: "skipped" },
  ],
  allOtherGatedResults: "reject",
  standaloneWorkflowRuns: {
    permissions: { actions: "read" },
    checkoutAllowed: false,
    changedFilesCompleteness: "event-count-equals-paginated-api",
    jobTimeoutMinutes: 35,
    waitTimeoutMinutes: 32,
    initialDelaySeconds: 10,
    pollIntervalSeconds: 60,
    successRunQuietWindowSeconds: 60,
    freshRunRequiredActions: [
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
      "edited",
    ],
    requiredEvent: "pull_request",
    requiredStatus: "completed",
    requiredConclusion: "success",
    match: [
      "workflow-id",
      "workflow-path",
      "workflow-name",
      "display-title",
      "pull-request-number",
      "pull-request-action",
      "pull-request-updated-at",
      "head-sha",
      "head-repository",
      "head-ref",
    ],
    select: "latest-created-at-then-run-id",
    missingOrTimeout: "reject",
    allOtherCompletedConclusions: "reject",
    workflows: [
      {
        gateOutput: "pi-parallel-tool-ordering-required",
        workflowId: "pi-parallel-tool-ordering.yml",
        path: ".github/workflows/pi-parallel-tool-ordering.yml",
        name: "Pi parallel Tool ordering contract",
        runNamePrefix: "parallel-tool-ordering",
        paths: [
          ".github/workflows/pi-parallel-tool-ordering.yml",
          ".github/workflows/ci.yml",
          "harness.config.json",
          "scripts/check-harness.mjs",
          "docs/harness/main-protection.md",
          "package.json",
          "packages/pi-adapter/fixtures/pi-upstream-baseline.json",
          "packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json",
          "scripts/check-pi-parallel-tool-ordering-result.mjs",
          "scripts/probes/pi-lifecycle-ci.mjs",
          "scripts/probes/pi-parallel-tool-ordering-capture.mjs",
          "docs/spikes/pi-runtime-contract/README.md",
          "docs/spikes/pi-runtime-contract/parallel-tool-ordering-lifecycle.md",
          "docs/architecture/pi-integration.md",
        ],
      },
      {
        gateOutput: "pi-compaction-session-replacement-required",
        workflowId: "pi-compaction-session-replacement.yml",
        path: ".github/workflows/pi-compaction-session-replacement.yml",
        name: "Pi Compaction and Session Replacement contract",
        runNamePrefix: "compaction-session-replacement",
        paths: [
          ".github/workflows/pi-compaction-session-replacement.yml",
          ".github/workflows/ci.yml",
          "harness.config.json",
          "scripts/check-harness.mjs",
          "docs/harness/main-protection.md",
          "package.json",
          "packages/pi-adapter/fixtures/pi-upstream-baseline.json",
          "packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json",
          "scripts/check-pi-compaction-session-replacement-result.mjs",
          "scripts/probes/pi-lifecycle-ci.mjs",
          "scripts/probes/pi-compaction-session-replacement-capture.mjs",
          "docs/spikes/pi-runtime-contract/README.md",
          "docs/spikes/pi-runtime-contract/compaction-session-replacement-lifecycle.md",
          "docs/architecture/pi-integration.md",
          "docs/harness/project-state.md",
        ],
      },
      {
        gateOutput: "pi-sdk-rpc-parity-required",
        workflowId: "pi-sdk-rpc-parity.yml",
        path: ".github/workflows/pi-sdk-rpc-parity.yml",
        name: "Pi SDK and RPC parity contract",
        runNamePrefix: "sdk-rpc-parity",
        paths: [
          ".github/workflows/pi-sdk-rpc-parity.yml",
          ".github/workflows/ci.yml",
          "harness.config.json",
          "scripts/check-harness.mjs",
          "docs/harness/main-protection.md",
          "package.json",
          "packages/pi-adapter/fixtures/pi-upstream-baseline.json",
          "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/**",
          "scripts/check-pi-sdk-rpc-parity-result.mjs",
          "scripts/check-pi-sdk-rpc-client-messages-result.mjs",
          "scripts/check-pi-sdk-rpc-parity-provenance.mjs",
          "scripts/pi-sdk-rpc-parity-fixture.mjs",
          "scripts/probes/pi-lifecycle-ci.mjs",
          "scripts/probes/pi-sdk-rpc-parity-contract.mjs",
          "scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs",
          "scripts/probes/pi-sdk-rpc-parity-capture.mjs",
          "scripts/probes/pi-sdk-rpc-parity-composite-capture.mjs",
          "docs/spikes/pi-runtime-contract/README.md",
          "docs/spikes/pi-runtime-contract/sdk-rpc-parity-lifecycle.md",
          "docs/architecture/pi-integration.md",
          "docs/harness/project-state.md",
        ],
      },
    ],
  },
};
requireValue(
  jsonEqual(config.mainProtection?.requiredStatusCheck, expectedRequiredStatusCheck),
  "Harness required-status aggregation contract differs from the exact fail-closed configuration.",
);

for (const required of ["true", "false", "unknown"]) {
  for (const result of ["success", "skipped", "failure", "cancelled"]) {
    const configured = expectedRequiredStatusCheck.allowedGatedResults.some(
      (candidate) => candidate.required === required && candidate.result === result,
    );
    requireValue(
      gatedCiResultAllowed(required, result) === configured,
      `Required-status truth table drifted for required=${required}, result=${result}.`,
    );
  }
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
    currentRisk.evidence?.rulesetRecord === rulesetPath &&
    currentRisk.evidence?.ownerAdminReadbackCapturedAt === "2026-08-13T02:45:00Z",
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
    currentRisk.governanceDecision?.enableSecretScanningAndPushProtection === true &&
    currentRisk.governanceDecision?.storeLongLivedAdminCredential === false,
  "Current autonomous governance decision is incomplete.",
);
for (const control of [
  "The active default-branch ruleset has no bypass actors.",
  "Pull request workflows execute untrusted fork code with read-only tokens and no repository secrets.",
  "External-fork pull requests are never autonomously merged; token-bearing workflow_run jobs require a same-repository source.",
  "Token-bearing provenance jobs never execute fork-controlled code.",
  "Secret scanning and push protection remain enabled while validity checks stay disabled unless a later risk review authorizes issuer verification side effects.",
  "The 2026-08-13 owner/admin live readback of bypass actors and security-and-analysis settings remains versioned in the Ruleset record.",
  "Repository Hygiene continuously verifies only the subset readable by its ephemeral GITHUB_TOKEN and must not claim continuous verification of administrator-only fields.",
  "No PAT or other long-lived administrator credential is stored for continuous governance monitoring.",
  "Probe artifacts are uploaded only after both capture and sanitization checks succeed; failure JSON is not public evidence.",
]) {
  requireValue(currentRisk.mandatoryControls?.includes(control), `Current risk acceptance is missing mandatory control: ${control}`);
}
requireValue(
  currentRisk.revisitTriggers?.includes("The active ruleset is disabled, deleted, bypassed, or materially modified."),
  "Ruleset drift must trigger current risk reassessment.",
);
requireValue(
  currentRisk.revisitTriggers?.includes(
    "A Ruleset, security setting, permission, or governance change affects an administrator-only field and the owner/admin readback has not been refreshed.",
  ),
  "Administrator-only field changes must trigger a fresh owner/admin readback.",
);
requireValue(
  currentRisk.revisitTriggers?.includes(
    "A PAT or other long-lived administrator credential is proposed for continuous governance monitoring.",
  ),
  "A proposed long-lived administrator credential must trigger reassessment.",
);

requireValue(
  rulesetRecord.schemaVersion === 1 && rulesetRecord.status === "active-verified",
  "Ruleset record must be active-verified schema 1.",
);
requireValue(
  rulesetRecord.lastOwnerAdminVerifiedAt === "2026-08-13T02:45:00Z",
  "Ruleset record must retain the dated owner/admin verification timestamp.",
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
    activeRuleTypes: ["deletion", "non_fast_forward", "required_linear_history", "pull_request", "required_status_checks"],
  }),
  "Ruleset live readback is incomplete or incorrect.",
);
requireValue(
  jsonEqual(rulesetRecord.verificationBoundary, {
    ownerAdminLiveReadback: {
      capturedAt: "2026-08-13T02:45:00Z",
      evidenceKind: "versioned-owner-admin-api-readback",
      versionedRecord: rulesetPath,
      rulesetBypassActors: [],
      currentUserCanBypass: "never",
      securityAndAnalysis: {
        secretScanning: "enabled",
        secretScanningPushProtection: "enabled",
        validityChecks: "disabled",
      },
    },
    continuousGithubTokenReadback: {
      credential: "ephemeral-GITHUB_TOKEN",
      scope: "token-readable-subset",
      fields: [
        "repository.visibility",
        "repository.default_branch",
        "repository.merge_settings",
        "main.protected",
        "ruleset.identity",
        "ruleset.enforcement",
        "ruleset.conditions",
        "ruleset.rules",
      ],
      excludedAdminFields: ["ruleset.bypass_actors", "repository.security_and_analysis"],
    },
    longLivedAdminCredentialStored: false,
    tradeoff:
      "The repository does not store a PAT or other long-lived administrator secret for continuous monitoring; bypass actors and security-and-analysis drift require a fresh owner/admin readback when a revisit trigger fires.",
  }),
  "Ruleset verification boundary must separate dated owner/admin evidence from the continuously token-readable subset.",
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
  "owner/admin live readback",
  "普通临时 `GITHUB_TOKEN`不能读取",
  "`bypass_actors`",
  "`security_and_analysis`",
  "不保存 PAT或其他长期管理员 Secret",
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
const ciJobs = readWorkflowJobs(ci);
const requiredStatusCheck = config.mainProtection?.requiredStatusCheck;
const expectedCiJobIds = [
  ...(requiredStatusCheck?.evidenceNeeds ?? []),
  requiredStatusCheck?.evidenceJob,
  requiredStatusCheck?.aggregatorJob,
];
requireValue(
  jsonEqual([...ciJobs.keys()], expectedCiJobIds),
  "CI jobs must be exactly static contracts, five dynamic Probes, required evidence, and check observer.",
);

const staticContractsBlock = ciJobs.get(requiredStatusCheck?.staticContractsJob) ?? "";
const evidenceBlock = ciJobs.get(requiredStatusCheck?.evidenceJob) ?? "";
const finalCheckBlock = ciJobs.get(requiredStatusCheck?.aggregatorJob) ?? "";
const standaloneContract = requiredStatusCheck?.standaloneWorkflowRuns;
const expectedCiRunName =
  "run-name: ci | event=${{ github.event_name }} | " +
  "pr=${{ github.event.pull_request.number || 'none' }} | " +
  "action=${{ github.event.action || 'none' }} | " +
  "updated_at=${{ github.event.pull_request.updated_at || 'none' }} | " +
  "ready=${{ github.event_name == 'pull_request' && github.event.pull_request.draft == false }} | " +
  "base=${{ github.event.pull_request.base.sha || 'none' }} | " +
  "head=${{ github.event.pull_request.head.sha || github.sha }} | " +
  "run=${{ github.run_id }}";
requireValue(
  ci.split(/\r?\n/)[1] === expectedCiRunName &&
    (ci.match(/^run-name:/gm) ?? []).length === 1,
  "CI must publish the exact machine-readable run/attempt identity.",
);
requireValue(
  /^  static-contracts:\s*$[\s\S]*?^    name: Static contracts\s*$/m.test(staticContractsBlock),
  "The former static check job must be renamed to static-contracts / Static contracts.",
);
requireValue(
  !/^    name: check\s*$/m.test(staticContractsBlock),
  "The static contracts job must not publish the Ruleset-required check context.",
);
requireValue(
  /^  check:\s*$[\s\S]*?^    name: check\s*$/m.test(finalCheckBlock),
  "Only the early observer job may publish the Ruleset-required check context.",
);
requireValue(
  [...ciJobs.values()].filter((block) => /^    name: check\s*$/m.test(block)).length === 1,
  "CI must publish exactly one job named check.",
);
requireValue(
  /^  ci-required-evidence:\s*$[\s\S]*?^    name: CI required evidence\s*$/m.test(
    evidenceBlock,
  ) && evidenceBlock.includes("    if: always()"),
  "The required evidence job must retain its exact ID/name and always observe dependency results.",
);
requireValue(
  jsonEqual(readListNeeds(evidenceBlock), requiredStatusCheck?.evidenceNeeds),
  "The required evidence job must need static contracts and all five governed dynamic Probe jobs.",
);
requireValue(
  jsonEqual(readYamlMapping(evidenceBlock, "permissions"), standaloneContract?.permissions) &&
    evidenceBlock.includes(
      `    timeout-minutes: ${requiredStatusCheck?.evidenceJobTimeoutMinutes}`,
    ),
  "The required evidence job must retain actions: read and its exact timeout.",
);
requireValue(
  jsonEqual(readListNeeds(finalCheckBlock), requiredStatusCheck?.aggregatorNeeds) &&
    !/^    needs:/m.test(finalCheckBlock),
  "The check observer must register without needs.",
);
requireValue(
  !/^    if:/m.test(finalCheckBlock) &&
    jsonEqual(
      readYamlMapping(finalCheckBlock, "permissions"),
      requiredStatusCheck?.aggregatorPermissions,
    ) &&
    finalCheckBlock.includes(
      `    timeout-minutes: ${requiredStatusCheck?.aggregatorTimeoutMinutes}`,
    ) &&
    !finalCheckBlock.includes("actions/checkout@"),
  "The check observer must start eagerly with only actions: read, no checkout, and exact timeout.",
);
for (const token of [
  "const changedFileCount = context.payload.pull_request?.changed_files",
  "Number.isSafeInteger(changedFileCount)",
  "github.paginate(github.rest.pulls.listFiles",
  "files.length !== changedFileCount",
  "Pull request file enumeration is incomplete",
  "file.status === \"renamed\" && file.previous_filename",
]) {
  requireValue(
    staticContractsBlock.includes(token),
    `Static contracts changed-file completeness check is missing token: ${token}`,
  );
}

const ciPullRequestBlock = readWorkflowTriggerBlock(ci, "pull_request");
requireValue(
  jsonEqual(
    readInlineYamlList(ciPullRequestBlock, "types"),
    standaloneContract?.freshRunRequiredActions,
  ),
  "CI pull_request actions must exactly match the five fresh standalone-run actions.",
);

const standalonePathVariables = {
  "pi-parallel-tool-ordering-required": "parallelToolOrderingPaths",
  "pi-compaction-session-replacement-required": "compactionSessionReplacementPaths",
  "pi-sdk-rpc-parity-required": "sdkRpcParityPaths",
};
for (const workflowContract of standaloneContract?.workflows ?? []) {
  const pathVariable = standalonePathVariables[workflowContract.gateOutput];
  requireValue(
    pathVariable !== undefined &&
      jsonEqual(readJavaScriptStringArray(staticContractsBlock, pathVariable), workflowContract.paths),
    `CI changed-file array for ${workflowContract.gateOutput} differs from the standalone workflow contract.`,
  );
  requireValue(
    staticContractsBlock.includes(`      ${workflowContract.gateOutput}: \${{ steps.changed-files.outputs.${workflowContract.gateOutput} }}`) &&
      staticContractsBlock.includes(`              "${workflowContract.gateOutput}",`),
    `Static contracts must expose and set exact path gate ${workflowContract.gateOutput}.`,
  );

  const standaloneWorkflow = await read(workflowContract.path);
  const pullRequestBlock = readWorkflowTriggerBlock(standaloneWorkflow, "pull_request");
  const pushBlock = readWorkflowTriggerBlock(standaloneWorkflow, "push");
  requireValue(
    standaloneWorkflow.startsWith(`name: ${workflowContract.name}\n`),
    `${workflowContract.path} workflow name differs from the polling identity.`,
  );
  const expectedRunName =
    `run-name: ${workflowContract.runNamePrefix} | event=\${{ github.event_name }} | ` +
    `pr=\${{ github.event.pull_request.number || 'none' }} | ` +
    `action=\${{ github.event.action || 'none' }} | ` +
    `updated_at=\${{ github.event.pull_request.updated_at || 'none' }} | ` +
    `head=\${{ github.event.pull_request.head.sha || github.sha }}`;
  requireValue(
    standaloneWorkflow.split(/\r?\n/)[1] === expectedRunName &&
      (standaloneWorkflow.match(/^run-name:/gm) ?? []).length === 1,
    `${workflowContract.path} must publish the exact machine-readable run-name identity.`,
  );
  requireValue(
    jsonEqual(
      readInlineYamlList(pullRequestBlock, "types"),
      standaloneContract.freshRunRequiredActions,
    ),
    `${workflowContract.path} pull_request actions must create fresh runs for all five CI actions.`,
  );
  requireValue(
    jsonEqual(readYamlList(pullRequestBlock, "paths"), workflowContract.paths) &&
      jsonEqual(readYamlList(pushBlock, "paths"), workflowContract.paths),
    `${workflowContract.path} pull_request/push path filters must exactly match the CI path gate.`,
  );
  requireValue(
    jsonEqual(readInlineYamlList(pushBlock, "branches"), ["main"]),
    `${workflowContract.path} push trigger must remain limited to main.`,
  );
}

const standaloneExpectedEntries = standaloneContract?.workflows ?? [];
for (const workflowContract of standaloneExpectedEntries) {
  for (const token of [
    `required: process.env.${workflowContract.gateOutput
      .replace(/^pi-/, "")
      .replace(/-/g, "_")
      .toUpperCase()}`,
    `workflowId: "${workflowContract.workflowId}"`,
    `path: "${workflowContract.path}"`,
    `name: "${workflowContract.name}"`,
    `runNamePrefix: "${workflowContract.runNamePrefix}"`,
  ]) {
    requireValue(
      evidenceBlock.includes(token),
      `Required evidence polling identity for ${workflowContract.workflowId} is missing token: ${token}`,
    );
  }
  requireValue(
    evidenceBlock.includes(
      `needs.static-contracts.outputs.${workflowContract.gateOutput} == 'true'`,
    ) &&
      evidenceBlock.includes(
        `needs.static-contracts.outputs.${workflowContract.gateOutput} || 'false'`,
      ),
    `Required evidence must condition and environment-gate ${workflowContract.workflowId}.`,
  );
}

for (const token of [
  "      - name: Wait for required standalone workflow runs",
  "success() &&",
  "github.event_name == 'pull_request'",
  "needs.static-contracts.result == 'success'",
  "uses: actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b",
  'PR_ACTION: ${{ github.event.action }}',
  'PR_HEAD_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name }}',
  'PR_HEAD_REF: ${{ github.event.pull_request.head.ref }}',
  'PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}',
  'PR_NUMBER: ${{ github.event.pull_request.number }}',
  'PR_UPDATED_AT: ${{ github.event.pull_request.updated_at }}',
  "const pullUpdatedAtText = process.env.PR_UPDATED_AT",
  'if (!/^[0-9a-f]{40}$/.test(headSha ?? ""))',
  'if (!headRepository || !headRef)',
  "const supportedActions = new Set([",
  "if (!supportedActions.has(action))",
  `const deadline = Date.now() + ${standaloneContract?.waitTimeoutMinutes} * 60 * 1_000`,
  "const observedSuccess = new Map()",
  `await delay(${standaloneContract?.initialDelaySeconds}_000)`,
  `await delay(${standaloneContract?.pollIntervalSeconds}_000)`,
  "github.rest.actions.listWorkflowRuns",
  "const expectedDisplayTitle =",
  "`${workflow.runNamePrefix} | event=pull_request | pr=${pullNumber} | `",
  "`action=${action} | updated_at=${pullUpdatedAtText} | head=${headSha}`",
  "workflow_id: workflow.workflowId",
  'event: "pull_request"',
  "head_sha: headSha",
  'run.event === "pull_request"',
  "run.head_sha === headSha",
  "run.path === workflow.path",
  "run.name === workflow.name",
  "run.display_title === expectedDisplayTitle",
  "run.head_repository?.full_name === headRepository",
  "run.head_branch === headRef",
  "Date.parse(run.created_at ?? \"\") >= pullUpdatedAt",
  "return createdDifference || right.id - left.id",
  "return { workflow, latest: candidates[0] }",
  'latest.status !== "completed"',
  'latest.conclusion !== "success"',
  "observedSuccess.delete(workflow.workflowId)",
  "const previousObservation = observedSuccess.get(workflow.workflowId)",
  "previousObservation.id !== latest.id",
  "stableSince: observedAt",
  `observedAt - previousObservation.stableSince < ${standaloneContract?.successRunQuietWindowSeconds}_000`,
  "registration quiet window",
  "waiting.push(`${workflow.name}: missing`)",
  "if (Date.now() >= deadline)",
  "Timed out waiting for standalone workflows",
  "All required standalone workflow runs succeeded.",
]) {
  requireValue(
    evidenceBlock.includes(token),
    `Required evidence standalone polling contract is missing token: ${token}`,
  );
}
requireValue(
  !evidenceBlock.includes("allowExistingSameHead"),
  "Required evidence must never reuse an older same-HEAD standalone run, including for edited.",
);

for (const [jobId, gateOutput] of Object.entries(requiredStatusCheck?.gatedJobs ?? {})) {
  const block = ciJobs.get(jobId) ?? "";
  requireValue(
    block.includes("    needs: static-contracts") &&
      block.includes(`    if: needs.static-contracts.outputs.${gateOutput} == 'true'`),
    `${jobId} must be gated only by static-contracts output ${gateOutput}.`,
  );
  requireValue(
    block.includes("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02") &&
      block.includes("        if: success()") &&
      !block.includes("        if: always()"),
    `${jobId} must upload evidence only after successful capture and validation.`,
  );
}

for (const required of [
  'STATIC_CONTRACTS_RESULT: ${{ needs.static-contracts.result }}',
  "if [[ \"$STATIC_CONTRACTS_RESULT\" != \"success\" ]]",
  'case "${required}:${result}" in',
  "true:success|false:skipped) return 0",
  "assert_gate_case allow true success",
  "assert_gate_case deny true skipped",
  "assert_gate_case deny true failure",
  "assert_gate_case deny true cancelled",
  "assert_gate_case allow false skipped",
  "assert_gate_case deny false success",
  "assert_gate_case deny false failure",
  "assert_gate_case deny false cancelled",
  "assert_gate_case deny unknown success",
  'require_gated_result "Pi npm Artifact probe" "$ARTIFACT_REQUIRED" "$ARTIFACT_RESULT"',
  'require_gated_result "Pi SDK and Extension lifecycle probe" "$LIFECYCLE_REQUIRED" "$LIFECYCLE_RESULT"',
  'require_gated_result "Pi automatic retry lifecycle probe" "$LIFECYCLE_REQUIRED" "$RETRY_RESULT"',
  'require_gated_result "Pi follow-up queue lifecycle probe" "$LIFECYCLE_REQUIRED" "$FOLLOW_UP_RESULT"',
  'require_gated_result "Pi cancellation and retry exhaustion lifecycle probe" "$LIFECYCLE_REQUIRED" "$CANCEL_RETRY_EXHAUSTION_RESULT"',
  "if (( failures > 0 )); then",
  "Required CI aggregation: OK",
]) {
  requireValue(
    evidenceBlock.includes(required),
    `Required evidence aggregation is missing truth-table token: ${required}`,
  );
}

for (const token of [
  "      - name: Observe required evidence in this workflow run",
  "uses: actions/github-script@f28e40c7f34bde8b3046d885e986cb6290c5673b",
  'RUN_ID: ${{ github.run_id }}',
  'RUN_ATTEMPT: ${{ github.run_attempt }}',
  "const runAttemptText = process.env.RUN_ATTEMPT",
  "const runIdText = process.env.RUN_ID",
  'if (!/^[1-9][0-9]*$/.test(runIdText ?? ""))',
  'if (!/^[1-9][0-9]*$/.test(runAttemptText ?? ""))',
  "const runId = Number(runIdText)",
  "const runAttempt = Number(runAttemptText)",
  "!Number.isSafeInteger(runId) || !Number.isSafeInteger(runAttempt)",
  'EVENT_NAME: ${{ github.event_name }}',
  "const expectedDisplayTitle =",
  "`ci | event=${eventName} | pr=${pullNumber} | action=${eventAction} | `",
  "`updated_at=${pullUpdatedAt} | ready=${expectedReady} | `",
  "`base=${expectedBaseSha} | head=${expectedHeadSha} | `",
  "`run=${runIdText}`",
  "github.rest.actions.getWorkflowRunAttempt",
  "attempt_number: runAttempt",
  "currentRun.id !== runId",
  "currentRun.run_attempt !== runAttempt",
  "currentRun.event !== eventName",
  "currentRun.head_sha !== expectedHeadSha",
  "currentRun.display_title !== expectedDisplayTitle",
  `const targetJobName = "${requiredStatusCheck?.evidenceJobName}"`,
  `const observerJobName = "${requiredStatusCheck?.aggregatorJobName}"`,
  "if (targetJobName === observerJobName)",
  `const deadline = Date.now() + ${requiredStatusCheck?.aggregatorPollDeadlineMinutes} * 60 * 1_000`,
  "github.rest.actions.listJobsForWorkflowRunAttempt",
  "run_id: runId",
  "attempt_number: runAttempt",
  "per_page: 100",
  "job.name === targetJobName",
  "if (targets.length > 1)",
  "target.run_id !== runId",
  "target.run_attempt !== runAttempt",
  "target.head_sha !== expectedHeadSha",
  "job.name === observerJobName",
  "observer.run_id !== runId",
  "observer.run_attempt !== runAttempt",
  "observer.head_sha !== expectedHeadSha",
  "target && observer && target.id === observer.id",
  'target?.status === "completed"',
  'target.conclusion === "success"',
  'new Set(["queued", "in_progress"]).has(target.status)',
  "has unexpected status",
  "Timed out waiting for current workflow run",
  `await delay(${requiredStatusCheck?.aggregatorPollIntervalSeconds}_000)`,
]) {
  requireValue(
    finalCheckBlock.includes(token),
    `Check observer current-run polling contract is missing token: ${token}`,
  );
}

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
requireValue(
  (ci.match(/if: always\(\)/g) ?? []).length === 1 && evidenceBlock.includes("if: always()"),
  "CI may use if: always() only for required evidence, never for Probe uploads or check observer.",
);

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
  "run.name !== \"CI\" || run.path !== \".github/workflows/ci.yml\"",
  "const ciIdentityPattern =",
  "event=pull_request",
  "ready=(true|false)",
  "ciReady !== \"true\"",
  "ciHeadSha !== run.head_sha",
  "ciRunId !== String(run.id)",
  "const expectedCiDisplayTitle =",
  "updated_at=${pr.updated_at}",
  "ready=true",
  "run.display_title !== expectedCiDisplayTitle",
  "Pull request event identity changed after the successful CI run",
]) {
  requireValue(autoMerge.includes(required), `Autonomous Merge is missing required token: ${required}`);
}

const provenanceDispatch = await read(".github/workflows/main-provenance-dispatch.yml");
for (const required of [
  "actions: read",
  "run.name !== \"CI\" || run.path !== \".github/workflows/ci.yml\"",
  "const ciIdentityPattern =",
  "event=pull_request",
  "ready=(true|false)",
  "ciReady === \"false\"",
  "Draft pull request CI completed; no provenance dispatch is required.",
  "ciReady !== \"true\"",
  "ciHeadSha !== run.head_sha",
  "ciRunId !== String(run.id)",
  "github.rest.actions.listWorkflowRuns",
  "candidateRun.head_repository?.full_name === repositoryFullName",
  "candidateIdentity?.[1] === pullNumberText",
  "candidateIdentity?.[4] === \"true\"",
  "candidateIdentity?.[5] === testedBaseSha",
  "candidateIdentity?.[6] === run.head_sha",
  "candidateIdentity?.[7] === String(candidateRun.id)",
  "successful-ci-run-selection-unavailable",
  "successful-ci-run-selection-mismatch",
  "successfulReadyRuns[0]?.id !== run.id",
  "provenance dispatch is left to the latest run",
]) {
  requireValue(
    provenanceDispatch.includes(required),
    `Main Provenance Dispatch CI identity contract is missing token: ${required}`,
  );
}
requireValue(
  !provenanceDispatch.includes("updated_at=${pr.updated_at}"),
  "Post-merge provenance dispatch must not compare CI event time with the merge-updated PR timestamp.",
);

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
  "repository.allow_merge_commit ===",
  "Configured admin-captured Ruleset record must declare no bypass actors.",
  "Configured security record does not require Secret Scanning and Push Protection.",
  "GITHUB_TOKEN. security_and_analysis, bypass_actors, and",
  "are not asserted from this token.",
  "GITHUB_TOKEN-readable live Ruleset identity does not match the configured record.",
  "GITHUB_TOKEN-readable live required-status Ruleset parameters drifted from the record.",
]) {
  requireValue(repositoryHygiene.includes(required), `Repository Hygiene is missing Public Ruleset audit token: ${required}`);
}
requireValue(
  !repositoryHygiene.includes("liveRuleset.bypass_actors"),
  "Repository Hygiene must not claim GITHUB_TOKEN live visibility of Ruleset bypass actors.",
);
requireValue(
  !repositoryHygiene.includes("liveRuleset.current_user_can_bypass"),
  "Repository Hygiene must not claim GITHUB_TOKEN live visibility of current-user bypass state.",
);
requireValue(
  !repositoryHygiene.includes("repository.security_and_analysis?.secret_scanning?.status ==="),
  "Repository Hygiene must not claim GITHUB_TOKEN live visibility of security-and-analysis settings.",
);

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
  "owner/admin live readback",
  "不声称在线验证 `bypass_actors`或 `security_and_analysis`",
  "PAT或其他长期管理员 Secret",
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
  "不得把 owner/admin权限才能读取",
  "PAT或长期管理员 Secret",
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
