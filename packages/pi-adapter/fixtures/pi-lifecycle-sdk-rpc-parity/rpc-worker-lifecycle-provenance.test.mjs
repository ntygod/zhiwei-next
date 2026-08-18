import { createHash } from "node:crypto";

import { readRpcWorkerV2Fixture } from "./rpc-worker-lifecycle-fixture.mjs";
import {
  validateArtifact,
  validateRpcWorkerV2ArtifactResults,
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


function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(name, content) {
  const filename = Buffer.from(name, "utf8");
  const checksum = crc32(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(filename.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(filename.length, 28);

  const centralOffset = local.length + filename.length + content.length;
  const centralSize = central.length + filename.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, content, central, filename, end]);
}

function artifactManifest(sourceZip, comparisonZip, resultBytes) {
  return {
    source: {
      artifactDigest: `sha256:${createHash("sha256").update(sourceZip).digest("hex")}`,
    },
    stability: {
      comparisonArtifactDigest:
        `sha256:${createHash("sha256").update(comparisonZip).digest("hex")}`,
      artifactResultJsonBytes: resultBytes.length,
      artifactResultJsonSha256:
        createHash("sha256").update(resultBytes).digest("hex"),
    },
  };
}

const committedFixture = await readRpcWorkerV2Fixture();
const normalizedArtifactResult = structuredClone(committedFixture.result);
const providerErrorCase =
  normalizedArtifactResult.capture.cases.acceptedProviderError;
requireValue(
  providerErrorCase.acceptanceStateProbe?.excludedFromFrozenFixture === true &&
    !Object.hasOwn(providerErrorCase, "stateDuring") &&
    !providerErrorCase.worker.transcript.some(
      (record) =>
        record.kind === "response" &&
        record.id === "provider-error-state-during" &&
        record.command === "get_state",
    ),
  "RPC Worker normalized Artifact test source is not already normalized.",
);
const normalizedResultBytes = Buffer.from(
  `${JSON.stringify(normalizedArtifactResult, null, 2)}\n`,
  "utf8",
);
const normalizedSourceZip = storedZip("result.json", normalizedResultBytes);
const normalizedComparisonZip = storedZip("result.json", normalizedResultBytes);
validateRpcWorkerV2ArtifactResults({
  manifest: artifactManifest(
    normalizedSourceZip,
    normalizedComparisonZip,
    normalizedResultBytes,
  ),
  committedResult: committedFixture.result,
  sourceZip: normalizedSourceZip,
  comparisonZip: normalizedComparisonZip,
});

const driftedArtifactResult = structuredClone(normalizedArtifactResult);
driftedArtifactResult.capture.cases.acceptedProviderError.acceptanceStateProbe.requestId =
  "drifted-provider-error-state";
const driftedResultBytes = Buffer.from(
  `${JSON.stringify(driftedArtifactResult, null, 2)}\n`,
  "utf8",
);
const driftedSourceZip = storedZip("result.json", driftedResultBytes);
const driftedComparisonZip = storedZip("result.json", driftedResultBytes);
expectFailure(
  "normalized Artifact content drift",
  () =>
    validateRpcWorkerV2ArtifactResults({
      manifest: artifactManifest(
        driftedSourceZip,
        driftedComparisonZip,
        driftedResultBytes,
      ),
      committedResult: committedFixture.result,
      sourceZip: driftedSourceZip,
      comparisonZip: driftedComparisonZip,
    }),
  /does not equal the complete committed v2 Fixture/,
);

console.log("RPC Worker v2 provenance metadata: OK");
