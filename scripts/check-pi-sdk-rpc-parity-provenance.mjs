import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_SDK_RPC_PARITY_MANIFEST,
  checkSdkRpcParityProvenance,
  readPullRequestEventContext,
} from "../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs";
import { checkRpcWorkerV2Provenance } from "../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-provenance.mjs";

export * from "../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs";

const thisPath = fileURLToPath(import.meta.url);
const basePath = resolve(
  dirname(thisPath),
  "../packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/rpc-worker-lifecycle-sdk-provenance-base.mjs",
);
const BASE_GIT_BLOB_SHA = "b07b9ab33efc36bd10325acb9bb8f07783ea5982";
const API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 20_000;
const WORKER_WAIT_MS = 4 * 60_000;
const POLL_MS = 5_000;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

export async function verifySdkRpcParityProvenanceBase() {
  const text = await readFile(basePath, "utf8");
  requireValue(
    gitBlobSha(text) === BASE_GIT_BLOB_SHA,
    "SDK/RPC provenance base Git blob identity drifted.",
  );
  return BASE_GIT_BLOB_SHA;
}

function positiveIntegerText(value, label) {
  requireValue(/^[1-9]\d*$/.test(value ?? ""), `${label} must be a positive integer.`);
  const parsed = Number(value);
  requireValue(Number.isSafeInteger(parsed), `${label} exceeds the safe integer range.`);
  return parsed;
}

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value ?? "");
  requireValue(match, "GITHUB_REPOSITORY must be owner/name.");
  return { owner: match[1], repository: match[2] };
}

function apiBase(value) {
  let parsed;
  try {
    parsed = new URL(value ?? "https://api.github.com");
  } catch {
    throw new Error("GITHUB_API_URL must be a valid URL.");
  }
  requireValue(
    parsed.protocol === "https:" && !parsed.username && !parsed.password &&
      !parsed.search && !parsed.hash,
    "GITHUB_API_URL must be credential-free HTTPS.",
  );
  return parsed.href.replace(/\/+$/, "");
}

async function githubJson(url, token, label, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "zhiwei-sdk-rpc-worker-ready-provenance",
        "X-GitHub-Api-Version": API_VERSION,
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
    throw new Error(`${label} response was not JSON.`);
  }
}

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export async function waitForCurrentRpcWorkerJob({
  environment = process.env,
  fetchImplementation = fetch,
  now = Date.now,
} = {}) {
  const token = environment.GITHUB_TOKEN;
  requireValue(typeof token === "string" && token.length > 0, "GITHUB_TOKEN is required.");
  const { owner, repository } = parseRepository(environment.GITHUB_REPOSITORY);
  const runId = positiveIntegerText(environment.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  const runAttempt = positiveIntegerText(
    environment.GITHUB_RUN_ATTEMPT,
    "GITHUB_RUN_ATTEMPT",
  );
  requireValue(
    typeof environment.GITHUB_EVENT_PATH === "string" &&
      environment.GITHUB_EVENT_PATH.length > 0,
    "GITHUB_EVENT_PATH is required.",
  );
  let event;
  try {
    event = JSON.parse(await readFile(resolve(environment.GITHUB_EVENT_PATH), "utf8"));
  } catch {
    throw new Error("GitHub event payload must be readable JSON.");
  }
  const eventContext = readPullRequestEventContext(
    event,
    environment.GITHUB_REPOSITORY,
    environment.GITHUB_EVENT_NAME,
  );
  const endpoint =
    `${apiBase(environment.GITHUB_API_URL)}/repos/${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repository)}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`;
  const deadline = now() + WORKER_WAIT_MS;
  while (true) {
    const response = await githubJson(
      endpoint,
      token,
      "Current workflow jobs",
      fetchImplementation,
    );
    requireValue(
      Number.isSafeInteger(response?.total_count) && Array.isArray(response?.jobs) &&
        response.jobs.length === response.total_count,
      "Current workflow jobs response is incomplete.",
    );
    const jobs = response.jobs.filter(
      (job) =>
        job?.name === "Pi RPC Worker lifecycle probe" &&
        job?.run_id === runId &&
        job?.run_attempt === runAttempt,
    );
    requireValue(jobs.length <= 1, "Current workflow has duplicate RPC Worker jobs.");
    if (jobs.length === 1 && jobs[0].status === "completed") {
      requireValue(
        jobs[0].conclusion === "success" &&
          jobs[0].head_sha === eventContext.headSha,
        `Current RPC Worker job did not succeed on the event HEAD: ` +
          `conclusion=${jobs[0].conclusion ?? "missing"}, ` +
          `head=${jobs[0].head_sha ?? "missing"}.`,
      );
      return { runId, runAttempt, jobId: jobs[0].id, headSha: eventContext.headSha };
    }
    requireValue(now() < deadline, "Timed out waiting for the current RPC Worker job.");
    await delay(POLL_MS);
  }
}

function parseArguments(args) {
  let manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST;
  let manifestSeen = false;
  let verifyBase = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      requireValue(!manifestSeen, "Use --manifest at most once.");
      manifestSeen = true;
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--manifest requires a path.");
      manifestPath = value;
    } else if (argument === "--verify-base") {
      requireValue(!verifyBase, "Use --verify-base at most once.");
      verifyBase = true;
    } else {
      throw new Error("Unknown SDK/RPC provenance argument.");
    }
  }
  requireValue(!verifyBase || !manifestSeen, "--verify-base cannot use --manifest.");
  return { manifestPath, verifyBase };
}

const isDirectExecution =
  typeof process.argv[1] === "string" && resolve(process.argv[1]) === resolve(thisPath);
if (isDirectExecution) {
  try {
    const { manifestPath, verifyBase } = parseArguments(process.argv.slice(2));
    const baseSha = await verifySdkRpcParityProvenanceBase();
    if (verifyBase) {
      console.log(`SDK/RPC provenance base: OK (${baseSha}).`);
    } else {
      const currentWorker = await waitForCurrentRpcWorkerJob();
      const [sdk, worker] = await Promise.all([
        checkSdkRpcParityProvenance({ manifestPath }),
        checkRpcWorkerV2Provenance(),
      ]);
      requireValue(
        sdk.currentHead === currentWorker.headSha &&
          worker.currentHead === currentWorker.headSha,
        "Live provenance components disagree on the current PR HEAD.",
      );
      console.log(
        `SDK/RPC and Worker v2 live provenance: OK (PR #${sdk.pullRequest}, ` +
          `head=${sdk.currentHead}, currentWorkerJob=${currentWorker.jobId}, ` +
          `sdkArtifact=${sdk.artifactId}, ` +
          `workerArtifacts=${worker.comparisonArtifactId}/${worker.sourceArtifactId}).`,
      );
    }
  } catch (error) {
    console.error(`SDK/RPC live provenance failed: ${error.message}`);
    process.exitCode = 1;
  }
}
