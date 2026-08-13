import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import {
  readSdkRpcParityFixture,
  SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
  validateSdkRpcParitySource,
} from "./pi-sdk-rpc-parity-fixture.mjs";

export const DEFAULT_SDK_RPC_PARITY_MANIFEST =
  "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json";
export const SDK_RPC_PARITY_WORKFLOW_NAME = "Pi SDK and RPC parity contract";
export const SDK_RPC_PARITY_WORKFLOW_PATH = ".github/workflows/pi-sdk-rpc-parity.yml";
export const SDK_RPC_PARITY_ARTIFACT_PREFIX = "pi-sdk-rpc-parity-probe";

const GITHUB_API_VERSION = "2022-11-28";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ARTIFACT_ZIP_BYTES = 16 * 1024 * 1024;
const SDK_RPC_PARITY_DISPLAY_TITLE_PATTERN =
  /^sdk-rpc-parity \| event=pull_request \| pr=([1-9]\d*) \| action=(opened|synchronize|reopened|ready_for_review|edited) \| updated_at=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z) \| head=([0-9a-f]{40})$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveSafeInteger(value) {
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

export function readVerifiedSdkRpcParitySource(manifest) {
  requireValue(isRecord(manifest), "SDK/RPC parity manifest must be an object.");
  requireValue(
    manifest.schemaVersion === 1,
    "SDK/RPC parity manifest schemaVersion must be 1.",
  );
  const source = manifest.source;
  const sourceState = validateSdkRpcParitySource(source);
  requireValue(
    sourceState === "verified",
    "SDK/RPC parity manifest source is still a candidate; live provenance requires a verified source.",
  );
  return source;
}

export function extractSdkRpcParityResultJson(zipBytes) {
  const archive = Buffer.isBuffer(zipBytes) ? zipBytes : Buffer.from(zipBytes);
  requireValue(
    archive.length >= 22 && archive.length <= MAX_ARTIFACT_ZIP_BYTES,
    "SDK/RPC parity Artifact ZIP size is invalid.",
  );

  const minimumEocdOffset = Math.max(0, archive.length - 65_557);
  let eocdOffset = -1;
  for (let offset = archive.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  requireValue(eocdOffset >= 0, "SDK/RPC parity Artifact ZIP end record is missing.");
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const centralDisk = archive.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const commentLength = archive.readUInt16LE(eocdOffset + 20);
  requireValue(
    diskNumber === 0 && centralDisk === 0 && entriesOnDisk === 1 && totalEntries === 1,
    "SDK/RPC parity Artifact ZIP must contain exactly one non-spanned entry.",
  );
  requireValue(
    eocdOffset + 22 + commentLength === archive.length &&
      centralOffset + centralSize === eocdOffset,
    "SDK/RPC parity Artifact ZIP directory bounds are invalid.",
  );
  requireValue(
    centralSize >= 46 && archive.readUInt32LE(centralOffset) === 0x02014b50,
    "SDK/RPC parity Artifact ZIP central entry is invalid.",
  );

  const flags = archive.readUInt16LE(centralOffset + 8);
  const method = archive.readUInt16LE(centralOffset + 10);
  const expectedCrc = archive.readUInt32LE(centralOffset + 16);
  const compressedSize = archive.readUInt32LE(centralOffset + 20);
  const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
  const nameLength = archive.readUInt16LE(centralOffset + 28);
  const extraLength = archive.readUInt16LE(centralOffset + 30);
  const entryCommentLength = archive.readUInt16LE(centralOffset + 32);
  const localOffset = archive.readUInt32LE(centralOffset + 42);
  requireValue((flags & 1) === 0, "SDK/RPC parity Artifact ZIP entry must not be encrypted.");
  requireValue(
    flags === 0 || flags === 0x0008,
    "SDK/RPC parity Artifact ZIP general-purpose flags are unsupported.",
  );
  requireValue(method === 0 || method === 8, "SDK/RPC parity Artifact ZIP compression is unsupported.");
  requireValue(
    uncompressedSize > 0 && uncompressedSize <= SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
    "SDK/RPC parity Artifact result.json size is invalid.",
  );
  const centralEnd = centralOffset + 46 + nameLength + extraLength + entryCommentLength;
  requireValue(
    centralEnd === eocdOffset && centralEnd <= archive.length,
    "SDK/RPC parity Artifact ZIP central entry bounds are invalid.",
  );
  const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
  requireValue(name === "result.json", "SDK/RPC parity Artifact ZIP entry must be result.json.");

  requireValue(
    localOffset + 30 <= centralOffset && archive.readUInt32LE(localOffset) === 0x04034b50,
    "SDK/RPC parity Artifact ZIP local entry is invalid.",
  );
  const localFlags = archive.readUInt16LE(localOffset + 6);
  const localMethod = archive.readUInt16LE(localOffset + 8);
  const localCrc = archive.readUInt32LE(localOffset + 14);
  const localCompressedSize = archive.readUInt32LE(localOffset + 18);
  const localUncompressedSize = archive.readUInt32LE(localOffset + 22);
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const localNameOffset = localOffset + 30;
  const localNameEnd = localNameOffset + localNameLength;
  const localExtraEnd = localNameEnd + localExtraLength;
  requireValue(
    localNameOffset <= localNameEnd &&
      localNameEnd <= localExtraEnd &&
      localExtraEnd <= centralOffset,
    "SDK/RPC parity Artifact ZIP local entry bounds are invalid.",
  );
  const localName = archive
    .subarray(localNameOffset, localNameEnd)
    .toString("utf8");
  requireValue(
    localFlags === flags && localMethod === method && localName === "result.json",
    "SDK/RPC parity Artifact ZIP local and central entries differ.",
  );
  const compressedOffset = localExtraEnd;
  const compressedEnd = compressedOffset + compressedSize;
  requireValue(
    compressedOffset <= compressedEnd && compressedEnd <= centralOffset,
    "SDK/RPC parity Artifact ZIP compressed data bounds are invalid.",
  );
  if ((flags & 0x0008) === 0) {
    requireValue(
      localCrc === expectedCrc &&
        localCompressedSize === compressedSize &&
        localUncompressedSize === uncompressedSize,
      "SDK/RPC parity Artifact ZIP local integrity fields differ from the central directory.",
    );
    requireValue(
      compressedEnd === centralOffset,
      "SDK/RPC parity Artifact ZIP contains data between result.json and the central directory.",
    );
  } else {
    requireValue(
      localCrc === 0 && localCompressedSize === 0 && localUncompressedSize === 0,
      "SDK/RPC parity Artifact ZIP data-descriptor local integrity fields must be zero.",
    );
    requireValue(
      compressedEnd + 16 === centralOffset &&
        archive.readUInt32LE(compressedEnd) === 0x08074b50 &&
        archive.readUInt32LE(compressedEnd + 4) === expectedCrc &&
        archive.readUInt32LE(compressedEnd + 8) === compressedSize &&
        archive.readUInt32LE(compressedEnd + 12) === uncompressedSize,
      "SDK/RPC parity Artifact ZIP data descriptor is invalid.",
    );
  }
  const compressed = archive.subarray(compressedOffset, compressedEnd);
  let resultJson;
  try {
    resultJson =
      method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, {
            maxOutputLength: SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
          });
  } catch {
    throw new Error("SDK/RPC parity Artifact result.json could not be decompressed.");
  }
  requireValue(
    resultJson.length === uncompressedSize && crc32(resultJson) === expectedCrc,
    "SDK/RPC parity Artifact result.json size or CRC differs from the ZIP directory.",
  );
  return resultJson;
}

export function validateSdkRpcParityArtifactContent({
  source,
  manifest,
  fixtureJsonBytes,
  artifactZipBytes,
}) {
  const archive = Buffer.isBuffer(artifactZipBytes)
    ? artifactZipBytes
    : Buffer.from(artifactZipBytes);
  requireValue(
    `sha256:${sha256(archive)}` === source.artifactDigest,
    "Downloaded Artifact ZIP digest differs from the manifest source.",
  );
  const resultJson = extractSdkRpcParityResultJson(archive);
  requireValue(
    sha256(resultJson) === manifest.jsonSha256,
    "Artifact result.json SHA-256 differs from the Fixture manifest.",
  );
  requireValue(
    Buffer.from(fixtureJsonBytes).equals(resultJson),
    "Artifact result.json differs from the committed Fixture bytes.",
  );
  return { artifactZipSha256: sha256(archive), resultJsonSha256: sha256(resultJson) };
}

export function readPullRequestEventContext(event, repository, eventName = "pull_request") {
  requireValue(eventName === "pull_request", "Live SDK/RPC provenance requires a pull_request event.");
  requireValue(isRecord(event), "GitHub event payload must be an object.");
  requireValue(
    sameRepository(event.repository?.full_name, repository),
    "GitHub event repository differs from GITHUB_REPOSITORY.",
  );

  const pullRequest = event.pull_request;
  requireValue(isRecord(pullRequest), "GitHub event payload must contain a pull request.");
  requireValue(
    isPositiveSafeInteger(event.number) && pullRequest.number === event.number,
    "GitHub event pull request number is missing or inconsistent.",
  );
  requireValue(pullRequest.state === "open", "GitHub event pull request must be open.");
  requireValue(pullRequest.draft === false, "Live SDK/RPC provenance rejects Draft pull requests.");
  requireValue(
    sameRepository(pullRequest.base?.repo?.full_name, repository),
    "GitHub event pull request base repository is not the canonical repository.",
  );
  requireValue(
    sameRepository(pullRequest.head?.repo?.full_name, repository),
    "GitHub event pull request head repository is not the canonical repository.",
  );
  requireValue(
    /^[0-9a-f]{40}$/.test(pullRequest.head?.sha ?? ""),
    "GitHub event pull request head must be a full lowercase commit SHA.",
  );
  requireValue(
    typeof pullRequest.head?.ref === "string" && pullRequest.head.ref.length > 0,
    "GitHub event pull request head ref is missing.",
  );

  return {
    number: event.number,
    headRef: pullRequest.head.ref,
    headSha: pullRequest.head.sha,
  };
}

export function validateSdkRpcParityProvenance({
  source,
  repository,
  eventPullRequest,
  pullRequest,
  run,
  workflow,
  artifact,
  comparison,
  now = Date.now(),
}) {
  requireValue(isRecord(source), "Verified SDK/RPC parity source is missing.");
  requireValue(
    typeof source.head === "string" &&
      /^[0-9a-f]{40}$/.test(source.head) &&
      isPositiveSafeInteger(source.workflowRun) &&
      isPositiveSafeInteger(source.artifactId) &&
      typeof source.artifactDigest === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(source.artifactDigest),
    "Verified SDK/RPC parity source has invalid values.",
  );
  requireValue(
    isPositiveSafeInteger(eventPullRequest?.number) &&
      /^[0-9a-f]{40}$/.test(eventPullRequest?.headSha ?? "") &&
      typeof eventPullRequest?.headRef === "string" &&
      eventPullRequest.headRef.length > 0,
    "GitHub event pull request context is invalid.",
  );

  requireValue(isRecord(pullRequest), "Live pull request response must be an object.");
  requireValue(
    pullRequest.number === eventPullRequest.number,
    "Live pull request number differs from the event payload.",
  );
  requireValue(pullRequest.state === "open", "Live pull request must remain open.");
  requireValue(pullRequest.draft === false, "Live pull request must not be Draft.");
  requireValue(
    sameRepository(pullRequest.base?.repo?.full_name, repository),
    "Live pull request base repository is not the canonical repository.",
  );
  requireValue(
    sameRepository(pullRequest.head?.repo?.full_name, repository),
    "Live pull request head repository is not the canonical repository.",
  );
  requireValue(
    pullRequest.head?.sha === eventPullRequest.headSha,
    "Live pull request head differs from the event payload; the provenance job is stale.",
  );
  requireValue(
    pullRequest.head?.ref === eventPullRequest.headRef,
    "Live pull request head ref differs from the event payload.",
  );

  requireValue(isRecord(run), "Live workflow run response must be an object.");
  requireValue(run.id === source.workflowRun, "Workflow run ID differs from the manifest source.");
  requireValue(
    run.path === SDK_RPC_PARITY_WORKFLOW_PATH,
    "Workflow run path is not the canonical SDK/RPC parity workflow path.",
  );
  const displayTitleMatch = SDK_RPC_PARITY_DISPLAY_TITLE_PATTERN.exec(
    run.display_title ?? "",
  );
  requireValue(
    displayTitleMatch !== null,
    "Workflow run display title is not the canonical SDK/RPC parity event identity.",
  );
  const displayPullNumber = Number(displayTitleMatch[1]);
  const displayUpdatedAt = Date.parse(displayTitleMatch[3]);
  const runCreatedAt = Date.parse(run.created_at ?? "");
  requireValue(
    Number.isSafeInteger(displayPullNumber) && displayPullNumber === eventPullRequest.number,
    "Workflow run display title pull request differs from the current pull request.",
  );
  requireValue(
    displayTitleMatch[4] === source.head,
    "Workflow run display title head differs from the manifest source head.",
  );
  requireValue(
    Number.isFinite(displayUpdatedAt) &&
      Number.isFinite(runCreatedAt) &&
      runCreatedAt >= displayUpdatedAt,
    "Workflow run creation time does not follow its encoded pull request event time.",
  );
  requireValue(run.event === "pull_request", "SDK/RPC parity workflow run must use pull_request.");
  requireValue(
    run.status === "completed" && run.conclusion === "success",
    "SDK/RPC parity workflow run must be completed successfully.",
  );
  requireValue(run.head_sha === source.head, "Workflow run head differs from the manifest source head.");
  requireValue(
    sameRepository(run.repository?.full_name, repository) &&
      sameRepository(run.head_repository?.full_name, repository),
    "Workflow run repository is not the canonical repository.",
  );
  requireValue(
    isPositiveSafeInteger(run.workflow_id) && isPositiveSafeInteger(run.run_attempt),
    "Workflow run identity or attempt is invalid.",
  );
  requireValue(
    Array.isArray(run.pull_requests) &&
      run.pull_requests.some((candidate) => candidate?.number === eventPullRequest.number),
    "Workflow run is not associated with the current pull request.",
  );

  requireValue(isRecord(workflow), "Live workflow response must be an object.");
  requireValue(workflow.id === run.workflow_id, "Workflow ID differs from the workflow run.");
  requireValue(
    workflow.name === SDK_RPC_PARITY_WORKFLOW_NAME && workflow.path === SDK_RPC_PARITY_WORKFLOW_PATH,
    "Workflow identity differs from the canonical SDK/RPC parity workflow.",
  );
  requireValue(workflow.state === "active", "Canonical SDK/RPC parity workflow must be active.");

  requireValue(isRecord(comparison), "Commit comparison response must be an object.");
  requireValue(
    comparison.status === "identical" || comparison.status === "ahead",
    "Manifest source head is not an ancestor of the current pull request head.",
  );
  requireValue(
    comparison.behind_by === 0 && Number.isSafeInteger(comparison.ahead_by),
    "Commit comparison does not prove an ancestor relationship.",
  );
  requireValue(
    comparison.base_commit?.sha === source.head && comparison.merge_base_commit?.sha === source.head,
    "Commit comparison base does not match the manifest source head.",
  );
  if (comparison.status === "identical") {
    requireValue(comparison.ahead_by === 0, "Identical commit comparison must have ahead_by 0.");
  } else {
    requireValue(comparison.ahead_by > 0, "Ahead commit comparison must have positive ahead_by.");
  }

  requireValue(isRecord(artifact), "Live Artifact response must be an object.");
  requireValue(artifact.id === source.artifactId, "Artifact ID differs from the manifest source.");
  const expectedArtifactName = `${SDK_RPC_PARITY_ARTIFACT_PREFIX}-${source.workflowRun}-${run.run_attempt}`;
  requireValue(
    artifact.name === expectedArtifactName,
    "Artifact name does not match the workflow run and attempt.",
  );
  requireValue(artifact.expired === false, "SDK/RPC parity Artifact is expired.");
  const expiresAt = Date.parse(artifact.expires_at ?? "");
  requireValue(
    Number.isFinite(expiresAt) && expiresAt > now,
    "SDK/RPC parity Artifact expiry timestamp is missing or elapsed.",
  );
  requireValue(
    artifact.digest === source.artifactDigest,
    "Artifact digest differs from the manifest source.",
  );
  requireValue(
    artifact.workflow_run?.id === source.workflowRun &&
      artifact.workflow_run?.head_sha === source.head,
    "Artifact does not belong to the manifest workflow run and head.",
  );
  requireValue(
    artifact.workflow_run?.repository_id === run.repository?.id &&
      artifact.workflow_run?.head_repository_id === run.head_repository?.id,
    "Artifact repository ownership differs from the workflow run.",
  );

  return {
    pullRequest: eventPullRequest.number,
    currentHead: eventPullRequest.headSha,
    captureHead: source.head,
    workflowRun: source.workflowRun,
    workflowAttempt: run.run_attempt,
    artifactId: source.artifactId,
  };
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

async function githubGetJson(url, token, label, fetchImplementation = fetch) {
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "zhiwei-sdk-rpc-parity-provenance",
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

async function readBoundedResponseBytes(response, label) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    requireValue(
      Number.isSafeInteger(declaredLength) &&
        declaredLength > 0 &&
        declaredLength <= MAX_ARTIFACT_ZIP_BYTES,
      `${label} Content-Length is invalid.`,
    );
  }
  requireValue(response.body, `${label} body is missing.`);
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ARTIFACT_ZIP_BYTES) {
        await reader.cancel();
        throw new Error(`${label} body size is invalid.`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof Error && error.message === `${label} body size is invalid.`) throw error;
    throw new Error(`${label} body could not be read.`);
  }
  requireValue(total > 0, `${label} body size is invalid.`);
  return Buffer.concat(chunks, total);
}

async function downloadArtifactZip(url, token, fetchImplementation = fetch) {
  let apiResponse;
  try {
    apiResponse = await fetchImplementation(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "zhiwei-sdk-rpc-parity-provenance",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Artifact ZIP request could not be completed.");
  }
  if (apiResponse.ok) return readBoundedResponseBytes(apiResponse, "Artifact ZIP");
  requireValue(
    [302, 303, 307, 308].includes(apiResponse.status),
    `Artifact ZIP request failed with HTTP ${apiResponse.status}.`,
  );

  const location = apiResponse.headers.get("location");
  let signedUrl;
  try {
    signedUrl = new URL(location);
  } catch {
    throw new Error("Artifact ZIP redirect location is invalid.");
  }
  requireValue(
    signedUrl.protocol === "https:" && !signedUrl.username && !signedUrl.password,
    "Artifact ZIP redirect must use a credential-free HTTPS URL.",
  );

  let downloadResponse;
  try {
    downloadResponse = await fetchImplementation(signedUrl, {
      headers: { "User-Agent": "zhiwei-sdk-rpc-parity-provenance" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Artifact ZIP download could not be completed.");
  }
  requireValue(
    downloadResponse.ok,
    `Artifact ZIP download failed with HTTP ${downloadResponse.status}.`,
  );
  return readBoundedResponseBytes(downloadResponse, "Artifact ZIP");
}

function parseArguments(args) {
  let manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST;
  let manifestSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      requireValue(!manifestSeen, "Use --manifest at most once.");
      manifestSeen = true;
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--manifest requires a path.");
      manifestPath = value;
    } else {
      throw new Error("Unknown SDK/RPC provenance argument.");
    }
  }
  return { manifestPath };
}

export async function checkSdkRpcParityProvenance({
  manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST,
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

  const fixture = await readSdkRpcParityFixture(manifestPath);
  let event;
  try {
    event = JSON.parse(await readFile(resolve(eventPath), "utf8"));
  } catch {
    throw new Error("GitHub event payload must be readable JSON.");
  }

  const source = readVerifiedSdkRpcParitySource(fixture.manifest);
  const eventPullRequest = readPullRequestEventContext(
    event,
    repositoryName,
    environment.GITHUB_EVENT_NAME ?? "",
  );
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const request = (path, label) =>
    githubGetJson(`${apiBase}${repoPath}${path}`, token, label, fetchImplementation);

  const [pullRequest, run, artifact, comparison] = await Promise.all([
    request(`/pulls/${eventPullRequest.number}`, "Pull request"),
    request(`/actions/runs/${source.workflowRun}`, "Workflow run"),
    request(`/actions/artifacts/${source.artifactId}`, "Artifact"),
    request(
      `/compare/${encodeURIComponent(source.head)}...${encodeURIComponent(eventPullRequest.headSha)}`,
      "Commit comparison",
    ),
  ]);
  requireValue(
    isPositiveSafeInteger(run?.workflow_id),
    "Workflow run response is missing a valid workflow ID.",
  );
  const workflow = await request(`/actions/workflows/${run.workflow_id}`, "Workflow");
  const provenance = validateSdkRpcParityProvenance({
    source,
    repository: repositoryName,
    eventPullRequest,
    pullRequest,
    run,
    workflow,
    artifact,
    comparison,
    now,
  });
  const artifactZipBytes = await downloadArtifactZip(
    `${apiBase}${repoPath}/actions/artifacts/${source.artifactId}/zip`,
    token,
    fetchImplementation,
  );
  const content = validateSdkRpcParityArtifactContent({
    source,
    manifest: fixture.manifest,
    fixtureJsonBytes: fixture.jsonBytes,
    artifactZipBytes,
  });
  return { ...provenance, ...content };
}

async function runCli() {
  const { manifestPath } = parseArguments(process.argv.slice(2));
  const result = await checkSdkRpcParityProvenance({ manifestPath });
  console.log(
    `SDK/RPC parity live provenance: OK (PR #${result.pullRequest}, capture ${result.captureHead}, run ${result.workflowRun}, Artifact ${result.artifactId})`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
