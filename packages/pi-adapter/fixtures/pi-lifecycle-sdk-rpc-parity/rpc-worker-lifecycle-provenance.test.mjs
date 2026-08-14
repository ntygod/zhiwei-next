import {
  validateArtifact,
  validateRunAttempt,
  validateWorkerArtifactJob,
} from "./rpc-worker-lifecycle-provenance.mjs";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function expectFailure(label, operation, pattern) {
  let error;
  try {
    operation();
  } catch (caught) {
    error = caught;
  }
  requireValue(error instanceof Error, `${label} unexpectedly succeeded.`);
  requireValue(pattern.test(error.message), `${label} failed with unexpected message: ${error.message}`);
}

const repository = "ntygod/zhiwei-next";
const sourceHead = "19f3e93a2bdf4f6b66e4abef00509e9549b22f6b";
const workflowRun = 31701880114;
const runAttempt = 2;
const eventContext = { number: 64 };
const run = {
  id: workflowRun,
  run_attempt: runAttempt,
  path: ".github/workflows/pi-sdk-rpc-parity.yml",
  event: "pull_request",
  status: "completed",
  conclusion: "failure",
  head_sha: sourceHead,
  repository: { id: 1, full_name: repository },
  head_repository: { id: 1, full_name: repository },
  pull_requests: [{ number: 64 }],
  workflow_id: 332586201,
  display_title:
    `sdk-rpc-parity | event=pull_request | pr=64 | action=synchronize | ` +
    `updated_at=2026-08-13T12:49:28Z | head=${sourceHead}`,
  created_at: "2026-08-13T12:49:38Z",
};

validateRunAttempt({
  run,
  repository,
  eventContext,
  sourceHead,
  workflowRun,
  runAttempt,
});
expectFailure(
  "historical attempt relabelled success",
  () =>
    validateRunAttempt({
      run: { ...run, conclusion: "success" },
      repository,
      eventContext,
      sourceHead,
      workflowRun,
      runAttempt,
    }),
  /historical failure conclusion/,
);

const requiredSteps = [
  ["Validate RPC Worker lifecycle probe sources", "success"],
  ["Capture fresh Pi RPC Worker lifecycle in sandbox", "success"],
  ["Validate fresh sanitized RPC Worker lifecycle evidence", "success"],
  ["Validate committed RPC Worker lifecycle Fixture", "success"],
  ["Compare committed RPC Worker Fixture with fresh evidence", "failure"],
  ["Upload fresh sanitized RPC Worker lifecycle evidence", "success"],
].map(([name, conclusion]) => ({ name, status: "completed", conclusion }));
const jobsResponse = {
  total_count: 1,
  jobs: [
    {
      id: 94453333957,
      name: "Pi RPC Worker lifecycle probe",
      run_id: workflowRun,
      run_attempt: runAttempt,
      head_sha: sourceHead,
      status: "completed",
      conclusion: "failure",
      steps: requiredSteps,
    },
  ],
};
validateWorkerArtifactJob({ jobsResponse, workflowRun, runAttempt, sourceHead });
const compareStepIndex = requiredSteps.findIndex(
  (step) => step.name === "Compare committed RPC Worker Fixture with fresh evidence",
);
const relabelledSteps = structuredClone(requiredSteps);
relabelledSteps[compareStepIndex].conclusion = "success";
expectFailure(
  "historical compare step relabelled success",
  () =>
    validateWorkerArtifactJob({
      jobsResponse: {
        total_count: 1,
        jobs: [{ ...jobsResponse.jobs[0], steps: relabelledSteps }],
      },
      workflowRun,
      runAttempt,
      sourceHead,
    }),
  /must be failure/,
);
expectFailure(
  "truncated jobs response",
  () =>
    validateWorkerArtifactJob({
      jobsResponse: { total_count: 2, jobs: jobsResponse.jobs },
      workflowRun,
      runAttempt,
      sourceHead,
    }),
  /truncated/,
);

const source = {
  workflowRun,
  head: sourceHead,
};
const artifactDigest =
  "sha256:d7d81bc279c7533777c130fb2b294460fa8a8fff5a2326bf6b2a4f0efd373b09";
const artifact = {
  id: 9181642601,
  name: `pi-rpc-worker-lifecycle-probe-${workflowRun}-${runAttempt}`,
  expired: false,
  expires_at: "2026-08-27T12:52:11Z",
  digest: artifactDigest,
  workflow_run: {
    id: workflowRun,
    head_sha: sourceHead,
    repository_id: 1,
    head_repository_id: 1,
  },
};
validateArtifact({
  artifact,
  repositoryRun: run,
  source,
  runAttempt,
  artifactId: artifact.id,
  artifactDigest,
  now: Date.parse("2026-08-14T00:00:00Z"),
});
expectFailure(
  "Artifact digest drift",
  () =>
    validateArtifact({
      artifact: { ...artifact, digest: `sha256:${"0".repeat(64)}` },
      repositoryRun: run,
      source,
      runAttempt,
      artifactId: artifact.id,
      artifactDigest,
      now: Date.parse("2026-08-14T00:00:00Z"),
    }),
  /digest differs/,
);
expectFailure(
  "Artifact ID drift",
  () =>
    validateArtifact({
      artifact: { ...artifact, id: artifact.id + 1 },
      repositoryRun: run,
      source,
      runAttempt,
      artifactId: artifact.id,
      artifactDigest,
      now: Date.parse("2026-08-14T00:00:00Z"),
    }),
  /ID differs/,
);

console.log("RPC Worker v2 provenance metadata: OK");
