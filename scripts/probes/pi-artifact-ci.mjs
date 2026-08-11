import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const baselinePath = join(repoRoot, "packages/pi-adapter/fixtures/pi-upstream-baseline.json");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const packageSpec = `${baseline.package.name}@${baseline.package.version}`;
const registry = "https://registry.npmjs.org/";
const outputPath = resolve(
  process.env.PI_PROBE_OUTPUT ??
    process.argv[2] ??
    join(process.env.RUNNER_TEMP ?? tmpdir(), "zhiwei-pi-artifact-result", "result.json"),
);
const sourceBundleReadOnly = process.env.PI_PROBE_SOURCE_READ_ONLY === "true";
const hostWorkspaceMounted = process.env.PI_PROBE_HOST_WORKSPACE_MOUNTED === "true";
const containerRootFilesystemReadOnly = process.env.PI_PROBE_CONTAINER_ROOT_READ_ONLY === "true";
const containerCapabilitiesDropped = process.env.PI_PROBE_CAPABILITIES_DROPPED === "true";
const containerNoNewPrivileges = process.env.PI_PROBE_NO_NEW_PRIVILEGES === "true";
const containerImage = process.env.PI_PROBE_CONTAINER_IMAGE;
const tempRoot = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), "zhiwei-pi-artifact-"));
const homeDir = join(tempRoot, "home");
const cacheDir = join(tempRoot, "npm-cache");
const packDir = join(tempRoot, "pack");
const installDir = join(tempRoot, "install");
const workspaceDir = join(tempRoot, "workspace");
const npmrcPath = join(tempRoot, "npmrc");

const attempts = [];
const result = {
  schemaVersion: 1,
  status: "running",
  capturedAt: new Date().toISOString(),
  sourceBaseline: {
    repository: baseline.upstream.repository,
    releaseTag: baseline.upstream.releaseTag,
    commit: baseline.upstream.commit,
  },
  package: {
    spec: packageSpec,
    name: baseline.package.name,
    version: baseline.package.version,
  },
  environment: {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    githubActions: process.env.GITHUB_ACTIONS === "true",
    containerImage,
  },
  attempts,
};

class ProbeError extends Error {
  constructor(stage, message, exitCode) {
    super(message);
    this.name = "ProbeError";
    this.stage = stage;
    this.exitCode = exitCode;
  }
}

function redact(value) {
  let text = String(value ?? "");
  text = text.replaceAll(repoRoot, "<repo>");
  text = text.replaceAll(tempRoot, "<temp>");
  text = text.replaceAll(process.execPath, "node");
  text = text.replace(/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|npm)_[A-Za-z0-9_=-]{8,}\b/g, "<redacted-token>");
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "<redacted-key>");
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer <redacted>");
  text = text.replace(/\/\/[^\s/:]+(?::\d+)?\/:_authToken=[^\s]+/gi, "//<registry>/:_authToken=<redacted>");
  return text.slice(0, 12000);
}

function childEnvironment(extra = {}) {
  const allowedKeys = [
    "PATH",
    "LANG",
    "LC_ALL",
    "CI",
    "GITHUB_ACTIONS",
    "RUNNER_OS",
    "RUNNER_ARCH",
    "SHELL",
    "SystemRoot",
    "COMSPEC",
  ];
  const env = Object.fromEntries(
    allowedKeys.filter((key) => typeof process.env[key] === "string").map((key) => [key, process.env[key]]),
  );
  return {
    ...env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: join(homeDir, ".config"),
    TMPDIR: join(tempRoot, "tmp"),
    TEMP: join(tempRoot, "tmp"),
    TMP: join(tempRoot, "tmp"),
    NPM_CONFIG_USERCONFIG: npmrcPath,
    NPM_CONFIG_CACHE: cacheDir,
    NPM_CONFIG_REGISTRY: registry,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NPM_CONFIG_UPDATE_NOTIFIER: "false",
    NO_UPDATE_NOTIFIER: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    ...extra,
  };
}

function formatCommand(command, args) {
  const displayCommand = command === process.execPath ? "node" : command;
  return [displayCommand, ...args]
    .map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

async function runCommand(stage, command, args, options = {}) {
  const startedAt = Date.now();
  const attempt = {
    stage,
    command: redact(formatCommand(command, args)),
    status: "running",
  };
  attempts.push(attempt);

  const timeoutMs = options.timeoutMs ?? 120000;
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? childEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  const append = (current, chunk) => (current + chunk.toString("utf8")).slice(-2_000_000);
  child.stdout.on("data", (chunk) => {
    stdout = append(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = append(stderr, chunk);
  });

  const outcome = await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new ProbeError(stage, `Command timed out after ${timeoutMs}ms.`, null));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new ProbeError(stage, error.message, null));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  }).catch((error) => {
    attempt.status = "failed";
    attempt.durationMs = Date.now() - startedAt;
    attempt.stderrSummary = redact(stderr || error.message);
    throw error;
  });

  attempt.durationMs = Date.now() - startedAt;
  attempt.exitCode = outcome.code;
  attempt.signal = outcome.signal ?? undefined;
  attempt.stderrPresent = stderr.length > 0;
  if (outcome.code !== 0) {
    attempt.status = "failed";
    attempt.stderrSummary = redact(stderr || stdout);
    throw new ProbeError(stage, `Command exited with code ${outcome.code}.`, outcome.code);
  }
  attempt.status = "ok";
  return { stdout, stderr };
}

function parseJson(stage, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ProbeError(stage, `Expected JSON output but parsing failed: ${error.message}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(algorithm, value, encoding) {
  return createHash(algorithm).update(value).digest(encoding);
}

function sortedStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function manifestSurface(manifest) {
  const exportsValue = manifest.exports;
  const exports =
    typeof exportsValue === "string"
      ? ["."]
      : exportsValue && typeof exportsValue === "object"
        ? Object.keys(exportsValue)
        : [];
  const bin =
    typeof manifest.bin === "string"
      ? [baseline.package.binary]
      : manifest.bin && typeof manifest.bin === "object"
        ? Object.keys(manifest.bin)
        : [];
  return {
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    license: manifest.license,
    nodeEngine: manifest.engines?.node,
    exports: sortedStrings(exports),
    bin: sortedStrings(bin),
    main: manifest.main,
  };
}

function requireCheck(stage, condition, message) {
  if (!condition) throw new ProbeError(stage, message);
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

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function verifySourceBundleReadOnly() {
  const startedAt = Date.now();
  const attempt = {
    stage: "source-bundle-read-only",
    command: "write <repo>/.zhiwei-probe-write-test",
    status: "running",
  };
  attempts.push(attempt);
  const testPath = join(repoRoot, ".zhiwei-probe-write-test");
  try {
    await writeFile(testPath, "unexpected write\n", "utf8");
    await rm(testPath, { force: true });
    attempt.status = "failed";
    attempt.durationMs = Date.now() - startedAt;
    throw new ProbeError("source-bundle-read-only", "The curated source bundle was writable.");
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    if (!["EROFS", "EACCES", "EPERM"].includes(error.code)) {
      attempt.status = "failed";
      attempt.durationMs = Date.now() - startedAt;
      attempt.stderrSummary = redact(error.message);
      throw new ProbeError("source-bundle-read-only", `Unexpected write-check error: ${error.message}`);
    }
    attempt.status = "ok";
    attempt.durationMs = Date.now() - startedAt;
    attempt.exitCode = 0;
    attempt.stderrPresent = false;
  }
}

async function writeResult() {
  await mkdir(dirname(outputPath), { recursive: true });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  const secretPatterns = [
    /\b(?:ghp|gho|ghu|ghs|ghr|github_pat|npm)_[A-Za-z0-9_=-]{8,}\b/,
    /\bsk-[A-Za-z0-9_-]{8,}\b/,
    /Bearer\s+[A-Za-z0-9._~+\/-]+=*/i,
    /_authToken\s*[=:]\s*[^\s"']+/i,
  ];
  if (secretPatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error("Result serialization contained a secret-like value and was not written.");
  }
  if (serialized.includes(repoRoot) || serialized.includes(tempRoot)) {
    throw new Error("Result serialization contained an absolute working path and was not written.");
  }
  await writeFile(outputPath, serialized, "utf8");
}

await Promise.all([
  mkdir(homeDir, { recursive: true }),
  mkdir(cacheDir, { recursive: true }),
  mkdir(packDir, { recursive: true }),
  mkdir(installDir, { recursive: true }),
  mkdir(workspaceDir, { recursive: true }),
  mkdir(join(tempRoot, "tmp"), { recursive: true }),
]);
await writeFile(
  npmrcPath,
  `registry=${registry}\nalways-auth=false\naudit=false\nfund=false\nupdate-notifier=false\n`,
  "utf8",
);
await writeFile(
  join(installDir, "package.json"),
  `${JSON.stringify({ name: "zhiwei-pi-artifact-probe", private: true, type: "module" }, null, 2)}\n`,
  "utf8",
);

try {
  requireCheck("environment", process.platform === "linux", "The isolated Artifact probe currently requires Linux.");

  const npmVersion = (await runCommand("npm-version", "npm", ["--version"])).stdout.trim();
  result.environment.npm = npmVersion;

  let beforeStatus = "";
  if (sourceBundleReadOnly) {
    await verifySourceBundleReadOnly();
  } else {
    beforeStatus = (
      await runCommand("repository-status-before", "git", ["status", "--porcelain=v1", "--untracked-files=all"])
    ).stdout;
    requireCheck("repository-status-before", beforeStatus.trim() === "", "Repository was not clean before the probe.");
  }

  const registryMetadata = parseJson(
    "registry-metadata",
    (
      await runCommand(
        "registry-metadata",
        "npm",
        ["view", packageSpec, "--json", `--registry=${registry}`],
        { timeoutMs: 90000 },
      )
    ).stdout,
  );

  const packRecords = parseJson(
    "npm-pack",
    (
      await runCommand(
        "npm-pack",
        "npm",
        [
          "pack",
          packageSpec,
          "--json",
          "--ignore-scripts",
          `--pack-destination=${packDir}`,
          `--registry=${registry}`,
        ],
        { timeoutMs: 120000 },
      )
    ).stdout,
  );
  requireCheck("npm-pack", Array.isArray(packRecords) && packRecords.length === 1, "npm pack did not return one record.");
  const packRecord = packRecords[0];
  const tarballPath = join(packDir, packRecord.filename);
  const tarballBytes = await readFile(tarballPath);
  const computedIntegrity = `sha512-${digest("sha512", tarballBytes, "base64")}`;
  const computedShasum = digest("sha1", tarballBytes, "hex");

  const manifestText = (
    await runCommand("tarball-manifest", "tar", ["-xOf", tarballPath, "package/package.json"])
  ).stdout;
  const manifest = parseJson("tarball-manifest", manifestText);
  const surface = manifestSurface(manifest);
  const expectedExports = sortedStrings(baseline.package.exports);
  const expectedBin = [baseline.package.binary];

  const checks = {
    registryVersionMatches: registryMetadata.version === baseline.package.version,
    registryIntegrityMatchesPack: registryMetadata.dist?.integrity === packRecord.integrity,
    packIntegrityMatchesBytes: packRecord.integrity === computedIntegrity,
    registryShasumMatchesPack: registryMetadata.dist?.shasum === packRecord.shasum,
    packShasumMatchesBytes: packRecord.shasum === computedShasum,
    manifestNameMatches: surface.name === baseline.package.name,
    manifestVersionMatches: surface.version === baseline.package.version,
    manifestNodeEngineMatches: surface.nodeEngine === baseline.package.nodeEngine,
    manifestLicenseMatches: surface.license === baseline.package.license,
    manifestExportsMatch: JSON.stringify(surface.exports) === JSON.stringify(expectedExports),
    manifestBinaryMatches: JSON.stringify(surface.bin) === JSON.stringify(expectedBin),
  };
  for (const [name, passed] of Object.entries(checks)) {
    requireCheck("artifact-comparison", passed, `Artifact comparison failed: ${name}.`);
  }

  result.registry = {
    version: registryMetadata.version,
    integrity: registryMetadata.dist.integrity,
    shasum: registryMetadata.dist.shasum,
    tarballUrl: registryMetadata.dist.tarball,
    nodeEngine: registryMetadata.engines?.node,
    license: registryMetadata.license,
  };
  result.tarball = {
    filename: packRecord.filename,
    size: packRecord.size,
    unpackedSize: packRecord.unpackedSize,
    fileCount: Array.isArray(packRecord.files) ? packRecord.files.length : undefined,
    integrity: packRecord.integrity,
    computedIntegrity,
    shasum: packRecord.shasum,
    computedShasum,
    manifestSha256: sha256(manifestText),
    manifest: surface,
  };
  result.checks = checks;

  await runCommand(
    "isolated-install",
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-save",
      "--package-lock=false",
      tarballPath,
    ],
    { cwd: installDir, timeoutMs: 180000 },
  );

  const packageDir = join(installDir, "node_modules", ...baseline.package.name.split("/"));
  requireCheck("isolated-install", await pathExists(join(packageDir, "package.json")), "Installed package manifest is missing.");
  const executable = join(
    installDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "pi.cmd" : "pi",
  );
  requireCheck("isolated-install", await pathExists(executable), "Installed Pi executable is missing.");

  const probeEnvironment = childEnvironment({
    PI_PACKAGE_DIR: packageDir,
    PI_EXECUTABLE: executable,
    PI_PROBE_CWD: workspaceDir,
  });
  const sdkProbe = parseJson(
    "sdk-probe",
    (
      await runCommand("sdk-probe", process.execPath, [join(repoRoot, "scripts/probes/pi-sdk-surface.mjs")], {
        env: probeEnvironment,
        timeoutMs: 60000,
      })
    ).stdout,
  );
  const rpcProbe = parseJson(
    "rpc-probe",
    (
      await runCommand("rpc-probe", process.execPath, [join(repoRoot, "scripts/probes/pi-rpc-state.mjs")], {
        env: probeEnvironment,
        timeoutMs: 60000,
      })
    ).stdout,
  );
  requireCheck("sdk-probe", sdkProbe.status === "ok", "SDK probe did not report ok.");
  requireCheck("rpc-probe", rpcProbe.status === "ok", "RPC probe did not report ok.");
  requireCheck("rpc-probe", rpcProbe.promptsSent === 0, "RPC probe unexpectedly sent a prompt.");

  if (!sourceBundleReadOnly) {
    const afterStatus = (
      await runCommand("repository-status-after", "git", ["status", "--porcelain=v1", "--untracked-files=all"])
    ).stdout;
    requireCheck("repository-status-after", afterStatus === beforeStatus, "Probe mutated the repository working tree.");
  }

  result.sdkProbe = sdkProbe;
  result.rpcProbe = rpcProbe;
  requireCheck("container-policy", sourceBundleReadOnly, "The probe source bundle must be mounted read-only.");
  requireCheck("container-policy", hostWorkspaceMounted === false, "The host repository workspace must not be mounted.");
  requireCheck("container-policy", containerRootFilesystemReadOnly, "The container root filesystem must be read-only.");
  requireCheck("container-policy", containerCapabilitiesDropped, "All Linux capabilities must be dropped.");
  requireCheck("container-policy", containerNoNewPrivileges, "no-new-privileges must be enabled.");
  requireCheck("container-policy", typeof containerImage === "string" && /@sha256:[0-9a-f]{64}$/.test(containerImage), "The probe container image must be digest-pinned.");

  result.security = {
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

  const fingerprintPayload = canonicalize({
    sourceBaseline: result.sourceBaseline,
    runtime: { containerImage: result.environment.containerImage },
    package: result.package,
    registry: {
      version: result.registry.version,
      integrity: result.registry.integrity,
      shasum: result.registry.shasum,
      nodeEngine: result.registry.nodeEngine,
      license: result.registry.license,
    },
    tarball: {
      integrity: result.tarball.integrity,
      computedIntegrity: result.tarball.computedIntegrity,
      shasum: result.tarball.shasum,
      computedShasum: result.tarball.computedShasum,
      manifestSha256: result.tarball.manifestSha256,
      manifest: result.tarball.manifest,
    },
    checks: result.checks,
    sdkProbe: {
      status: sdkProbe.status,
      package: sdkProbe.package,
      packageSource: sdkProbe.packageSource,
      exports: sdkProbe.exports,
      credentialsUsed: sdkProbe.credentialsUsed,
    },
    rpcProbe: {
      status: rpcProbe.status,
      package: rpcProbe.package,
      sessionIdPresent: rpcProbe.sessionIdPresent,
      isStreaming: rpcProbe.isStreaming,
      messageCount: rpcProbe.messageCount,
      credentialsUsed: rpcProbe.credentialsUsed,
      promptsSent: rpcProbe.promptsSent,
    },
    security: result.security,
  });
  result.contractFingerprint = sha256(JSON.stringify(fingerprintPayload));
  result.status = "runtime-verified";
  await writeResult();
  console.log(`Pi npm Artifact runtime probe: OK (${result.contractFingerprint})`);
} catch (error) {
  const probeError = error instanceof ProbeError ? error : new ProbeError("unexpected", error.message ?? String(error));
  result.status = "failed";
  result.failure = {
    stage: probeError.stage,
    exitCode: probeError.exitCode ?? undefined,
    message: redact(probeError.message),
  };
  try {
    await writeResult();
  } catch (writeError) {
    console.error(`Unable to write sanitized probe result: ${redact(writeError.message ?? String(writeError))}`);
  }
  console.error(`Pi npm Artifact runtime probe failed at ${probeError.stage}: ${redact(probeError.message)}`);
  process.exitCode = 1;
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
