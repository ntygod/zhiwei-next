import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const baselinePath = resolve(repoRoot, "packages/pi-adapter/fixtures/pi-upstream-baseline.json");
const committedRelativePath = "packages/pi-adapter/fixtures/pi-artifact-runtime.json";
const committedPath = resolve(repoRoot, committedRelativePath);
const requestedPath = process.argv[2] ? resolve(process.argv[2]) : committedPath;
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const violations = [];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprintPayload(result) {
  return canonicalize({
    sourceBaseline: result.sourceBaseline,
    runtime: { containerImage: result.environment?.containerImage },
    package: result.package,
    registry: {
      version: result.registry?.version,
      integrity: result.registry?.integrity,
      shasum: result.registry?.shasum,
      nodeEngine: result.registry?.nodeEngine,
      license: result.registry?.license,
    },
    tarball: {
      integrity: result.tarball?.integrity,
      computedIntegrity: result.tarball?.computedIntegrity,
      shasum: result.tarball?.shasum,
      computedShasum: result.tarball?.computedShasum,
      manifestSha256: result.tarball?.manifestSha256,
      manifest: result.tarball?.manifest,
    },
    checks: result.checks,
    sdkProbe: {
      status: result.sdkProbe?.status,
      package: result.sdkProbe?.package,
      packageSource: result.sdkProbe?.packageSource,
      exports: result.sdkProbe?.exports,
      credentialsUsed: result.sdkProbe?.credentialsUsed,
    },
    rpcProbe: {
      status: result.rpcProbe?.status,
      package: result.rpcProbe?.package,
      sessionIdPresent: result.rpcProbe?.sessionIdPresent,
      isStreaming: result.rpcProbe?.isStreaming,
      messageCount: result.rpcProbe?.messageCount,
      credentialsUsed: result.rpcProbe?.credentialsUsed,
      promptsSent: result.rpcProbe?.promptsSent,
    },
    security: result.security,
  });
}

function validate(result, rawText, label) {
  const prefix = `${label}: `;
  if (result.schemaVersion !== 1) violations.push(`${prefix}schemaVersion must be 1.`);
  if (result.status !== "runtime-verified") violations.push(`${prefix}status must be runtime-verified.`);
  if (!Number.isFinite(Date.parse(result.capturedAt))) violations.push(`${prefix}capturedAt must be an ISO timestamp.`);
  if (result.sourceBaseline?.repository !== baseline.upstream.repository) {
    violations.push(`${prefix}upstream repository differs from the source baseline.`);
  }
  if (result.sourceBaseline?.releaseTag !== baseline.upstream.releaseTag) {
    violations.push(`${prefix}release tag differs from the source baseline.`);
  }
  if (result.sourceBaseline?.commit !== baseline.upstream.commit) {
    violations.push(`${prefix}source commit differs from the source baseline.`);
  }
  if (result.package?.name !== baseline.package.name || result.package?.version !== baseline.package.version) {
    violations.push(`${prefix}package identity differs from the source baseline.`);
  }
  if (result.registry?.version !== baseline.package.version) {
    violations.push(`${prefix}registry version differs from the source baseline.`);
  }
  if (result.registry?.nodeEngine !== baseline.package.nodeEngine) {
    violations.push(`${prefix}registry Node engine differs from the source baseline.`);
  }
  if (result.registry?.license !== baseline.package.license) {
    violations.push(`${prefix}registry license differs from the source baseline.`);
  }
  if (!/^sha512-[A-Za-z0-9+/=]+$/.test(result.registry?.integrity ?? "")) {
    violations.push(`${prefix}registry integrity is missing or invalid.`);
  }
  if (!/^[0-9a-f]{40}$/.test(result.registry?.shasum ?? "")) {
    violations.push(`${prefix}registry shasum is missing or invalid.`);
  }
  if (result.tarball?.integrity !== result.tarball?.computedIntegrity) {
    violations.push(`${prefix}tarball integrity does not match the computed digest.`);
  }
  if (result.tarball?.shasum !== result.tarball?.computedShasum) {
    violations.push(`${prefix}tarball shasum does not match the computed digest.`);
  }
  if (result.tarball?.manifest?.name !== baseline.package.name) {
    violations.push(`${prefix}tarball manifest name differs from the baseline.`);
  }
  if (result.tarball?.manifest?.version !== baseline.package.version) {
    violations.push(`${prefix}tarball manifest version differs from the baseline.`);
  }
  if (result.tarball?.manifest?.nodeEngine !== baseline.package.nodeEngine) {
    violations.push(`${prefix}tarball manifest Node engine differs from the baseline.`);
  }
  const expectedExports = [...baseline.package.exports].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(result.tarball?.manifest?.exports) !== JSON.stringify(expectedExports)) {
    violations.push(`${prefix}tarball manifest exports differ from the baseline.`);
  }
  if (JSON.stringify(result.tarball?.manifest?.bin) !== JSON.stringify([baseline.package.binary])) {
    violations.push(`${prefix}tarball manifest binary differs from the baseline.`);
  }
  const failedChecks = Object.entries(result.checks ?? {}).filter(([, passed]) => passed !== true);
  if (failedChecks.length > 0 || Object.keys(result.checks ?? {}).length < 10) {
    violations.push(`${prefix}artifact comparison checks are missing or failed.`);
  }
  if (result.sdkProbe?.status !== "ok" || result.sdkProbe?.packageSource !== "isolated-package-dir") {
    violations.push(`${prefix}SDK probe did not verify the isolated package.`);
  }
  if (result.sdkProbe?.credentialsUsed !== false) {
    violations.push(`${prefix}SDK probe must not use credentials.`);
  }
  if (
    result.rpcProbe?.status !== "ok" ||
    result.rpcProbe?.executionMode !== "node-cli-entry" ||
    result.rpcProbe?.sessionIdPresent !== true ||
    result.rpcProbe?.credentialsUsed !== false ||
    result.rpcProbe?.promptsSent !== 0
  ) {
    violations.push(`${prefix}RPC probe did not satisfy the noexec-safe credential-free state contract.`);
  }
  if (!/^node:22\.23\.1-bookworm-slim@sha256:[0-9a-f]{64}$/.test(result.environment?.containerImage ?? "")) {
    violations.push(`${prefix}container image must be the digest-pinned Node 22.23.1 slim image.`);
  }
  const expectedSecurity = {
    workflowPermissions: "contents-read",
    hostSecretsPassedToProbe: false,
    providerCredentialsInjected: false,
    promptsSent: 0,
    installScriptsExecuted: false,
    sourceBundleReadOnly: true,
    sourceBundleMutationDetected: false,
    hostWorkspaceMounted: false,
    containerRootFilesystemReadOnly: true,
    containerCapabilitiesDropped: true,
    containerNoNewPrivileges: true,
    packageExecutedFromVerifiedTarball: true,
  };
  for (const [key, expected] of Object.entries(expectedSecurity)) {
    if (result.security?.[key] !== expected) violations.push(`${prefix}security.${key} must be ${expected}.`);
  }
  if (!Array.isArray(result.attempts) || result.attempts.some((attempt) => attempt.status !== "ok")) {
    violations.push(`${prefix}all recorded attempts must be successful.`);
  }
  if (/"sessionId"\s*:/.test(rawText)) violations.push(`${prefix}raw sessionId must not be persisted.`);
  if (/(?:\/home\/runner\/|\/opt\/hostedtoolcache\/|\/__w\/|[A-Za-z]:\\)/.test(rawText)) {
    violations.push(`${prefix}absolute runner paths must not be persisted.`);
  }
  if (/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|npm)_[A-Za-z0-9_=-]{8,}\b/.test(rawText)) {
    violations.push(`${prefix}secret-like token detected.`);
  }
  if (/\bsk-[A-Za-z0-9_-]{8,}\b/.test(rawText)) violations.push(`${prefix}secret-like API key detected.`);

  const expectedFingerprint = sha256(JSON.stringify(fingerprintPayload(result)));
  if (result.contractFingerprint !== expectedFingerprint) {
    violations.push(`${prefix}contractFingerprint does not match the verified semantic payload.`);
  }
  return expectedFingerprint;
}

const requestedExists = await exists(requestedPath);
const committedExists = await exists(committedPath);
const baselineRequiresResult = baseline.dynamicProbe?.status === "passed";

if (!requestedExists) {
  if (requestedPath !== committedPath || baselineRequiresResult) {
    violations.push(`Pi Artifact result is required but missing: ${requestedPath}`);
  } else {
    console.log("Pi npm Artifact runtime result: pending dynamic verification");
    process.exit(0);
  }
}

let requestedFingerprint;
let requestedResult;
if (requestedExists) {
  const requestedText = await readFile(requestedPath, "utf8");
  requestedResult = JSON.parse(requestedText);
  requestedFingerprint = validate(requestedResult, requestedText, "requested result");
}

let committedFingerprint;
let committedResult;
if (committedExists) {
  const committedText = await readFile(committedPath, "utf8");
  committedResult = JSON.parse(committedText);
  committedFingerprint =
    requestedPath === committedPath
      ? requestedFingerprint
      : validate(committedResult, committedText, "committed result");
}

if (committedFingerprint && requestedPath !== committedPath && requestedFingerprint !== committedFingerprint) {
  violations.push("Fresh dynamic result differs from the committed contract fingerprint.");
}

if (baselineRequiresResult) {
  if (baseline.status !== "source-and-runtime-verified") {
    violations.push("A passed dynamic probe requires source-and-runtime-verified baseline status.");
  }
  if (baseline.package?.registryArtifactVerified !== true) {
    violations.push("A passed dynamic probe requires registryArtifactVerified: true.");
  }
  if (baseline.dynamicProbe?.resultPath !== committedRelativePath) {
    violations.push("The passed dynamic probe must point to the committed runtime result path.");
  }
  if (!committedFingerprint || baseline.dynamicProbe?.contractFingerprint !== committedFingerprint) {
    violations.push("The baseline dynamic-probe fingerprint differs from the committed runtime result.");
  }
  if (!committedResult) {
    violations.push("The passed dynamic probe requires committed runtime evidence.");
  } else {
    if (baseline.dynamicProbe?.verifiedAt !== committedResult.capturedAt) {
      violations.push("The baseline verifiedAt timestamp differs from the committed runtime result.");
    }
    if (baseline.dynamicProbe?.registryArtifact?.integrity !== committedResult.registry?.integrity) {
      violations.push("The baseline registry integrity differs from the committed runtime result.");
    }
    if (baseline.dynamicProbe?.registryArtifact?.shasum !== committedResult.registry?.shasum) {
      violations.push("The baseline registry shasum differs from the committed runtime result.");
    }
    if (baseline.dynamicProbe?.registryArtifact?.manifestSha256 !== committedResult.tarball?.manifestSha256) {
      violations.push("The baseline manifest digest differs from the committed runtime result.");
    }
    if (baseline.dynamicProbe?.environment?.containerImage !== committedResult.environment?.containerImage) {
      violations.push("The baseline container image differs from the committed runtime result.");
    }
    if (baseline.dynamicProbe?.rpc?.executionMode !== committedResult.rpcProbe?.executionMode) {
      violations.push("The baseline RPC execution mode differs from the committed runtime result.");
    }
    if (baseline.dynamicProbe?.workflow?.runId !== committedResult.evidence?.workflowRunId) {
      violations.push("The baseline workflow run differs from the committed runtime evidence.");
    }
    if (baseline.dynamicProbe?.workflow?.artifactId !== committedResult.evidence?.artifactId) {
      violations.push("The baseline Artifact ID differs from the committed runtime evidence.");
    }
    if (baseline.dynamicProbe?.workflow?.artifactDigest !== committedResult.evidence?.artifactDigest) {
      violations.push("The baseline Artifact digest differs from the committed runtime evidence.");
    }
  }
  if (!Array.isArray(baseline.dynamicProbe?.recoveryEvidence) || baseline.dynamicProbe.recoveryEvidence.length < 2) {
    violations.push("The passed dynamic probe must preserve the rejected-host and noexec recovery evidence.");
  }
}

if (violations.length > 0) {
  console.error("Pi Artifact result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi npm Artifact runtime result: OK (${requestedFingerprint})`);
