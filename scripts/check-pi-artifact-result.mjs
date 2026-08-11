import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const baselinePath = resolve(repoRoot, "packages/pi-adapter/fixtures/pi-upstream-baseline.json");
const committedPath = resolve(repoRoot, "packages/pi-adapter/fixtures/pi-artifact-runtime.json");
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
    result.rpcProbe?.sessionIdPresent !== true ||
    result.rpcProbe?.credentialsUsed !== false ||
    result.rpcProbe?.promptsSent !== 0
  ) {
    violations.push(`${prefix}RPC probe did not satisfy the credential-free state contract.`);
  }
  const expectedSecurity = {
    workflowPermissions: "contents-read",
    repositorySecretsInjected: false,
    providerCredentialsInjected: false,
    promptsSent: 0,
    installScriptsExecuted: false,
    repositoryMutationDetected: false,
    packageExecutedFromVerifiedTarball: true,
  };
  for (const [key, expected] of Object.entries(expectedSecurity)) {
    if (result.security?.[key] !== expected) violations.push(`${prefix}security.${key} must be ${expected}.`);
  }
  if (!Array.isArray(result.attempts) || result.attempts.some((attempt) => attempt.status !== "ok")) {
    violations.push(`${prefix}all recorded attempts must be successful.`);
  }
  if (/"sessionId"\s*:/.test(rawText)) violations.push(`${prefix}raw sessionId must not be persisted.`);
  if (/\/(?:home|Users)\/[^\s"']+|[A-Za-z]:\\[^\s"']+/.test(rawText)) {
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
if (requestedExists) {
  const requestedText = await readFile(requestedPath, "utf8");
  const requested = JSON.parse(requestedText);
  requestedFingerprint = validate(requested, requestedText, "requested result");
}

if (committedExists && requestedPath !== committedPath) {
  const committedText = await readFile(committedPath, "utf8");
  const committed = JSON.parse(committedText);
  const committedFingerprint = validate(committed, committedText, "committed result");
  if (requestedFingerprint !== committedFingerprint) {
    violations.push("Fresh dynamic result differs from the committed contract fingerprint.");
  }
}

if (violations.length > 0) {
  console.error("Pi Artifact result violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Pi npm Artifact runtime result: OK (${requestedFingerprint})`);
