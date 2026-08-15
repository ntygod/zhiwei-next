import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  extractSdkRpcParityResultJson,
  readPullRequestEventContext,
} from "./rpc-worker-lifecycle-sdk-provenance-base.mjs";
import { readRpcWorkerV2Fixture } from "./rpc-worker-lifecycle-fixture.mjs";
import { normalizeRpcWorkerResult } from "./rpc-worker-lifecycle-normalizer.mjs";

const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ARTIFACT_ZIP_BYTES = 16 * 1024 * 1024;
const WORKFLOW_NAME = "Pi SDK and RPC parity contract";
const WORKFLOW_PATH = ".github/workflows/pi-sdk-rpc-parity.yml";
const ARTIFACT_PREFIX = "pi-rpc-worker-lifecycle-probe";
const DISPLAY_TITLE_PATTERN =
  /^sdk-rpc-parity \| event=pull_request \| pr=([1-9]\d*) \| action=(opened|synchronize|reopened|ready_for_review|edited) \| updated_at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z) \| head=([0-9a-f]{40})$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function sameRepository(left, right) {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseRepository(value) {
  requireValue(
    typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value),
    "GITHUB_REPOSITORY must be an owner/name repository.",
  );
  const [owner, repository] = value.split("/");
  return { owner, repository };
}

function normalizeApiBase(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("GITHUB_API_URL must be a valid HTTPS URL.");
  }
  requireValue(
    url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash,
    "GITHUB_API_URL must be a credential-free HTTPS URL.",
  );
  return url.href.replace(/\/+$/, "");
}

async function githubGetJson(url, token, label, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "zhiwei-rpc-worker-v2-provenance",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${label} request could not be completed.`);
  }
  requireValue(response.ok, `${label} request failed with HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} response was not valid JSON.`);
  }
}

async function readBoundedResponse(response, label) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    requireValue(
      Number.isSafeInteger(length) && length > 0 && length <= MAX_ARTIFACT_ZIP_BYTES,
      `${label} Content-Length is invalid.`,
    );
  }
  requireValue(response.body, `${label} response body is missing.`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ARTIFACT_ZIP_BYTES) {
        await reader.cancel();
        throw new Error(`${label} exceeds its byte limit.`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof Error && error.message === `${label} exceeds its byte limit.`) {
      throw error;
    }
    throw new Error(`${label} response body could not be read.`);
  }
  requireValue(total > 0, `${label} response body is empty.`);
  return Buffer.concat(chunks, total);
}

async function downloadArtifactZip(url, token, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "zhiwei-rpc-worker-v2-provenance",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("RPC Worker Artifact ZIP request could not be completed.");
  }
  if (response.ok) return readBoundedResponse(response, "RPC Worker Artifact ZIP");
  requireValue(
    [302, 303, 307, 308].includes(response.status),
    `RPC Worker Artifact ZIP request failed with HTTP ${response.status}.`,
  );
  let signedUrl;
  try {
    signedUrl = new URL(response.headers.get("location"));
  } catch {
    throw new Error("RPC Worker Artifact ZIP redirect location is invalid.");
  }
  requireValue(
    signedUrl.protocol === "https:" && !signedUrl.username && !signedUrl.password,
    "RPC Worker Artifact ZIP redirect must be credential-free HTTPS.",
  );
  let download;
  try {
    download = await fetchImplementation(signedUrl, {
      headers: { "User-Agent": "zhiwei-rpc-worker-v2-provenance" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("RPC Worker Artifact ZIP download could not be completed.");
  }
  requireValue(
    download.ok,
    `RPC Worker Artifact ZIP download failed with HTTP ${download.status}.`,
  );
  return readBoundedResponse(download, "RPC Worker Artifact ZIP");
}

function validateCurrentPullRequest(eventContext, repository, pullRequest) {
  requireValue(isRecord(pullRequest), "Live pull request response must be an object.");
  requireValue(pullRequest.number === eventContext.number, "Live pull request number differs from the event.");
  requireValue(pullRequest.state === "open", "Live pull request must remain open.");
  requireValue(pullRequest.draft === false, "RPC Worker live provenance rejects Draft pull requests.");
  requireValue(
    sameRepository(pullRequest.base?.repo?.full_name, repository) &&
      sameRepository(pullRequest.head?.repo?.full_name, repository),
    "Live pull request must use the canonical repository for base and head.",
  );
  requireValue(
    pullRequest.head?.sha === eventContext.headSha &&
      pullRequest.head?.ref === eventContext.headRef,
    "Live pull request head differs from the event; the provenance job is stale.",
  );
}

export function validateRunAttempt({
  run,
  repository,
  eventContext,
  sourceHead,
  workflowRun,
  runAttempt,
}) {
  requireValue(isRecord(run), "RPC Worker workflow-run attempt response must be an object.");
  requireValue(run.id === workflowRun, "RPC Worker workflow run ID differs from the manifest.");
  requireValue(run.run_attempt === runAttempt, "RPC Worker workflow attempt differs from the manifest.");
  requireValue(run.path === WORKFLOW_PATH, "RPC Worker workflow path drifted.");
  requireValue(run.event === "pull_request", "RPC Worker source run must use pull_request.");
  requireValue(
    run.status === "completed" && run.conclusion === "failure",
    "RPC Worker source run attempt must retain its historical failure conclusion.",
  );
  requireValue(run.head_sha === sourceHead, "RPC Worker source run head differs from the manifest.");
  requireValue(
    sameRepository(run.repository?.full_name, repository) &&
      sameRepository(run.head_repository?.full_name, repository),
    "RPC Worker source run repository is not canonical.",
  );
  requireValue(
    Array.isArray(run.pull_requests) &&
      run.pull_requests.some((candidate) => candidate?.number === eventContext.number),
    "RPC Worker source run is not associated with the current pull request.",
  );
  requireValue(positiveSafeInteger(run.workflow_id), "RPC Worker source workflow ID is invalid.");

  const display = DISPLAY_TITLE_PATTERN.exec(run.display_title ?? "");
  requireValue(display !== null, "RPC Worker source run display title is not canonical.");
  requireValue(Number(display[1]) === eventContext.number, "RPC Worker source display PR number drifted.");
  requireValue(display[4] === sourceHead, "RPC Worker source display head drifted.");
  const updatedAt = Date.parse(display[3]);
  const createdAt = Date.parse(run.created_at ?? "");
  requireValue(
    Number.isFinite(updatedAt) && Number.isFinite(createdAt) && createdAt >= updatedAt,
    "RPC Worker source run creation does not follow its encoded PR update.",
  );
}


const REQUIRED_CAPTURE_STEP_CONCLUSIONS = Object.freeze({
  "Validate RPC Worker lifecycle probe sources": "success",
  "Capture fresh Pi RPC Worker lifecycle in sandbox": "success",
  "Validate fresh sanitized RPC Worker lifecycle evidence": "success",
  "Validate committed RPC Worker lifecycle Fixture": "success",
  "Compare committed RPC Worker Fixture with fresh evidence": "failure",
  "Upload fresh sanitized RPC Worker lifecycle evidence": "success",
});

export function validateWorkerArtifactJob({ jobsResponse, workflowRun, runAttempt, sourceHead }) {
  requireValue(
    isRecord(jobsResponse) && Array.isArray(jobsResponse.jobs),
    "RPC Worker workflow jobs response must contain a jobs array.",
  );
  requireValue(
    jobsResponse.jobs.length === jobsResponse.total_count,
    "RPC Worker workflow jobs response is truncated.",
  );
  const matches = jobsResponse.jobs.filter(
    (job) =>
      job?.name === "Pi RPC Worker lifecycle probe" &&
      job?.run_id === workflowRun &&
      job?.run_attempt === runAttempt,
  );
  requireValue(
    matches.length === 1,
    "RPC Worker source attempt must contain exactly one lifecycle probe job.",
  );
  const job = matches[0];
  requireValue(
    job.status === "completed" &&
      job.conclusion === "failure" &&
      job.head_sha === sourceHead,
    "RPC Worker source lifecycle job identity or historical terminal result drifted.",
  );
  requireValue(Array.isArray(job.steps), "RPC Worker source lifecycle job steps are missing.");
  for (const [name, conclusion] of Object.entries(REQUIRED_CAPTURE_STEP_CONCLUSIONS)) {
    const steps = job.steps.filter((step) => step?.name === name);
    requireValue(
      steps.length === 1 &&
        steps[0].status === "completed" &&
        steps[0].conclusion === conclusion,
      `RPC Worker source attempt ${runAttempt} step ${name} must be ${conclusion}.`,
    );
  }
  return { jobId: job.id };
}

export function validateArtifact({
  artifact,
  repositoryRun,
  source,
  runAttempt,
  artifactId,
  artifactDigest,
  now,
}) {
  requireValue(isRecord(artifact), "RPC Worker Artifact response must be an object.");
  requireValue(artifact.id === artifactId, "RPC Worker Artifact ID differs from the manifest.");
  requireValue(
    artifact.name === `${ARTIFACT_PREFIX}-${source.workflowRun}-${runAttempt}`,
    "RPC Worker Artifact name does not identify its run and attempt.",
  );
  requireValue(artifact.expired === false, "RPC Worker Artifact is expired.");
  const expiresAt = Date.parse(artifact.expires_at ?? "");
  requireValue(Number.isFinite(expiresAt) && expiresAt > now, "RPC Worker Artifact expiry is missing or elapsed.");
  requireValue(artifact.digest === artifactDigest, "RPC Worker Artifact digest differs from the manifest.");
  requireValue(
    artifact.workflow_run?.id === source.workflowRun &&
      artifact.workflow_run?.head_sha === source.head &&
      artifact.workflow_run?.repository_id === repositoryRun.repository?.id &&
      artifact.workflow_run?.head_repository_id === repositoryRun.head_repository?.id,
    "RPC Worker Artifact workflow ownership differs from the source run.",
  );
}

function parseResultJson(bytes, label) {
  const text = bytes.toString("utf8");
  requireValue(Buffer.from(text, "utf8").equals(bytes), `${label} must be valid UTF-8.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

export function validateRpcWorkerV2ArtifactResults({
  manifest,
  committedResult,
  sourceZip,
  comparisonZip,
}) {
  requireValue(
    `sha256:${sha256(sourceZip)}` === manifest.source.artifactDigest,
    "Downloaded RPC Worker source ZIP digest differs from the manifest.",
  );
  requireValue(
    `sha256:${sha256(comparisonZip)}` === manifest.stability.comparisonArtifactDigest,
    "Downloaded RPC Worker comparison ZIP digest differs from the manifest.",
  );
  const sourceResultBytes = extractSdkRpcParityResultJson(sourceZip);
  const comparisonResultBytes = extractSdkRpcParityResultJson(comparisonZip);
  for (const [label, bytes] of [
    ["source result.json", sourceResultBytes],
    ["comparison result.json", comparisonResultBytes],
  ]) {
    requireValue(
      bytes.length === manifest.stability.artifactResultJsonBytes,
      `RPC Worker ${label} byte count differs from the manifest.`,
    );
    requireValue(
      sha256(bytes) === manifest.stability.artifactResultJsonSha256,
      `RPC Worker ${label} SHA-256 differs from the manifest.`,
    );
  }
  requireValue(
    sourceResultBytes.equals(comparisonResultBytes),
    "RPC Worker source and comparison result.json bytes are not identical.",
  );

  const sourceNormalized = normalizeRpcWorkerResult(
    parseResultJson(sourceResultBytes, "RPC Worker source result.json"),
  );
  const comparisonNormalized = normalizeRpcWorkerResult(
    parseResultJson(comparisonResultBytes, "RPC Worker comparison result.json"),
  );
  requireValue(
    isDeepStrictEqual(sourceNormalized, comparisonNormalized),
    "RPC Worker source attempts normalize to different complete objects.",
  );
  requireValue(
    isDeepStrictEqual(sourceNormalized, committedResult),
    "RPC Worker public source Artifact does not normalize to the complete committed v2 Fixture.",
  );
  return {
    sourceZipSha256: sha256(sourceZip),
    comparisonZipSha256: sha256(comparisonZip),
    resultJsonSha256: sha256(sourceResultBytes),
  };
}

export async function checkRpcWorkerV2Provenance({
  environment = process.env,
  fetchImplementation = fetch,
  now = Date.now(),
} = {}) {
  const token = environment.GITHUB_TOKEN;
  requireValue(typeof token === "string" && token.length > 0, "GITHUB_TOKEN is required.");
  const repositoryName = environment.GITHUB_REPOSITORY;
  const { owner, repository } = parseRepository(repositoryName);
  const apiBase = normalizeApiBase(environment.GITHUB_API_URL ?? "https://api.github.com");
  const eventPath = environment.GITHUB_EVENT_PATH;
  requireValue(typeof eventPath === "string" && eventPath.length > 0, "GITHUB_EVENT_PATH is required.");
  let event;
  try {
    event = JSON.parse(await readFile(resolve(eventPath), "utf8"));
  } catch {
    throw new Error("GitHub event payload must be readable JSON.");
  }
  const eventContext = readPullRequestEventContext(
    event,
    repositoryName,
    environment.GITHUB_EVENT_NAME,
  );
  const fixture = await readRpcWorkerV2Fixture();
  const { manifest } = fixture;
  const source = manifest.source;
  const comparisonAttempt = manifest.stability.comparisonRunAttempt;

  const repositoryApi = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const [
    pullRequest,
    sourceRun,
    comparisonRun,
    sourceArtifact,
    comparisonArtifact,
    comparison,
    sourceJobs,
    comparisonJobs,
  ] = await Promise.all([
    githubGetJson(
      `${repositoryApi}/pulls/${eventContext.number}`,
      token,
      "Live pull request",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/actions/runs/${source.workflowRun}/attempts/${source.runAttempt}`,
      token,
      "RPC Worker source workflow attempt",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/actions/runs/${source.workflowRun}/attempts/${comparisonAttempt}`,
      token,
      "RPC Worker comparison workflow attempt",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/actions/artifacts/${source.artifactId}`,
      token,
      "RPC Worker source Artifact",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/actions/artifacts/${manifest.stability.comparisonArtifactId}`,
      token,
      "RPC Worker comparison Artifact",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/compare/${source.head}...${eventContext.headSha}`,
      token,
      "RPC Worker source ancestry",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/actions/runs/${source.workflowRun}/attempts/${source.runAttempt}/jobs?per_page=100`,
      token,
      "RPC Worker source workflow jobs",
      fetchImplementation,
    ),
    githubGetJson(
      `${repositoryApi}/actions/runs/${source.workflowRun}/attempts/${comparisonAttempt}/jobs?per_page=100`,
      token,
      "RPC Worker comparison workflow jobs",
      fetchImplementation,
    ),
  ]);

  validateCurrentPullRequest(eventContext, repositoryName, pullRequest);
  validateRunAttempt({
    run: sourceRun,
    repository: repositoryName,
    eventContext,
    sourceHead: source.head,
    workflowRun: source.workflowRun,
    runAttempt: source.runAttempt,
  });
  validateRunAttempt({
    run: comparisonRun,
    repository: repositoryName,
    eventContext,
    sourceHead: source.head,
    workflowRun: source.workflowRun,
    runAttempt: comparisonAttempt,
  });
  requireValue(
    sourceRun.workflow_id === comparisonRun.workflow_id,
    "RPC Worker source attempts belong to different workflows.",
  );
  const sourceJob = validateWorkerArtifactJob({
    jobsResponse: sourceJobs,
    workflowRun: source.workflowRun,
    runAttempt: source.runAttempt,
    sourceHead: source.head,
  });
  const comparisonJob = validateWorkerArtifactJob({
    jobsResponse: comparisonJobs,
    workflowRun: source.workflowRun,
    runAttempt: comparisonAttempt,
    sourceHead: source.head,
  });
  const workflow = await githubGetJson(
    `${repositoryApi}/actions/workflows/${sourceRun.workflow_id}`,
    token,
    "RPC Worker workflow",
    fetchImplementation,
  );
  requireValue(
    workflow.id === sourceRun.workflow_id &&
      workflow.name === WORKFLOW_NAME &&
      workflow.path === WORKFLOW_PATH &&
      workflow.state === "active",
    "RPC Worker source workflow identity is not canonical and active.",
  );
  requireValue(
    isRecord(comparison) &&
      (comparison.status === "identical" || comparison.status === "ahead") &&
      comparison.behind_by === 0 &&
      Number.isSafeInteger(comparison.ahead_by) &&
      comparison.base_commit?.sha === source.head &&
      comparison.merge_base_commit?.sha === source.head,
    "RPC Worker source HEAD is not a proved ancestor of the current PR HEAD.",
  );
  validateArtifact({
    artifact: sourceArtifact,
    repositoryRun: sourceRun,
    source,
    runAttempt: source.runAttempt,
    artifactId: source.artifactId,
    artifactDigest: source.artifactDigest,
    now,
  });
  validateArtifact({
    artifact: comparisonArtifact,
    repositoryRun: comparisonRun,
    source,
    runAttempt: comparisonAttempt,
    artifactId: manifest.stability.comparisonArtifactId,
    artifactDigest: manifest.stability.comparisonArtifactDigest,
    now,
  });

  const [sourceZip, comparisonZip] = await Promise.all([
    downloadArtifactZip(
      `${repositoryApi}/actions/artifacts/${source.artifactId}/zip`,
      token,
      fetchImplementation,
    ),
    downloadArtifactZip(
      `${repositoryApi}/actions/artifacts/${manifest.stability.comparisonArtifactId}/zip`,
      token,
      fetchImplementation,
    ),
  ]);
  const content = validateRpcWorkerV2ArtifactResults({
    manifest,
    committedResult: fixture.result,
    sourceZip,
    comparisonZip,
  });
  return {
    pullRequest: eventContext.number,
    currentHead: eventContext.headSha,
    captureHead: source.head,
    workflowRun: source.workflowRun,
    sourceAttempt: source.runAttempt,
    comparisonAttempt,
    sourceArtifactId: source.artifactId,
    comparisonArtifactId: manifest.stability.comparisonArtifactId,
    sourceJobId: sourceJob.jobId,
    comparisonJobId: comparisonJob.jobId,
    ...content,
  };
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  try {
    const result = await checkRpcWorkerV2Provenance();
    console.log(
      `RPC Worker v2 live provenance: OK (PR #${result.pullRequest}, head=${result.currentHead}, ` +
        `run=${result.workflowRun}, attempts=${result.comparisonAttempt}/${result.sourceAttempt}, ` +
        `artifacts=${result.comparisonArtifactId}/${result.sourceArtifactId}).`,
    );
  } catch (error) {
    console.error(`RPC Worker v2 live provenance failed: ${error.message}`);
    process.exitCode = 1;
  }
}
