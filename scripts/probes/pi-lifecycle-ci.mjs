import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const baselinePath = resolve(
  process.env.PI_BASELINE_PATH ?? "packages/pi-adapter/fixtures/pi-upstream-baseline.json",
);
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-lifecycle-runtime.json"),
);
const captureScript = resolve(
  process.env.PI_LIFECYCLE_CAPTURE_SCRIPT ?? "scripts/probes/pi-lifecycle-capture.mjs",
);
const scenario = process.env.PI_LIFECYCLE_SCENARIO ?? "normal-tool";
const committedFixturePath = process.env.PI_LIFECYCLE_COMMITTED_FIXTURE
  ? resolve(process.env.PI_LIFECYCLE_COMMITTED_FIXTURE)
  : undefined;

let stage = "bootstrap";
let tempRoot;

function sha1(bytes) {
  return createHash("sha1").update(bytes).digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha512Integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function stableFingerprintValue(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function cleanEnvironment(overrides = {}) {
  const allowed = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "CI",
    "GITHUB_ACTIONS",
    "NODE_OPTIONS",
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return { ...env, ...overrides };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? cleanEnvironment(),
    encoding: "utf8",
    timeout: options.timeout ?? 180_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(
      `${command} ${args.join(" ")} exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`,
    );
    error.exitCode = result.status;
    throw error;
  }
  return result;
}

function normalizeError(error) {
  return {
    stage,
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    exitCode: Number.isInteger(error?.exitCode) ? error.exitCode : undefined,
  };
}

async function persist(result) {
  result.contractFingerprint = sha256(stableFingerprintValue(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function main() {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const packageName = baseline.package?.name;
  const packageVersion = baseline.package?.version;
  const expectedIntegrity = baseline.dynamicProbe?.registryArtifact?.integrity;
  const expectedShasum = baseline.dynamicProbe?.registryArtifact?.shasum;
  if (!packageName || !packageVersion || !expectedIntegrity || !expectedShasum) {
    throw new Error("Pi baseline is missing package or registry Artifact evidence.");
  }

  tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-pi-lifecycle-"));
  const packDir = join(tempRoot, "pack");
  const installDir = join(tempRoot, "install");
  const captureOutput = join(tempRoot, "capture.json");
  const workspaceDir = join(tempRoot, "workspace");
  const agentDir = join(tempRoot, "agent");
  await Promise.all([
    mkdir(packDir, { recursive: true }),
    mkdir(installDir, { recursive: true }),
    mkdir(workspaceDir, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  stage = "npm-pack";
  const npmVersion = run("npm", ["--version"], { cwd: packDir }).stdout.trim();
  const pack = run(
    "npm",
    [
      "pack",
      `${packageName}@${packageVersion}`,
      "--json",
      "--ignore-scripts",
      "--package-lock=false",
    ],
    {
      cwd: packDir,
      env: cleanEnvironment({
        HOME: join(tempRoot, "home-pack"),
        npm_config_cache: join(tempRoot, "npm-cache-pack"),
        npm_config_userconfig: join(tempRoot, "npmrc-pack"),
        npm_config_ignore_scripts: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
      }),
    },
  );
  const packRecords = JSON.parse(pack.stdout);
  if (!Array.isArray(packRecords) || packRecords.length !== 1 || !packRecords[0].filename) {
    throw new Error(`Unexpected npm pack output: ${pack.stdout}`);
  }
  const tarballPath = join(packDir, packRecords[0].filename);
  const tarballBytes = await readFile(tarballPath);
  const actualIntegrity = sha512Integrity(tarballBytes);
  const actualShasum = sha1(tarballBytes);
  if (actualIntegrity !== expectedIntegrity) {
    throw new Error(`Pi tarball integrity drift: expected ${expectedIntegrity}, got ${actualIntegrity}`);
  }
  if (actualShasum !== expectedShasum) {
    throw new Error(`Pi tarball shasum drift: expected ${expectedShasum}, got ${actualShasum}`);
  }

  stage = "install-verified-artifact";
  await writeFile(
    join(installDir, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--save=false",
      tarballPath,
    ],
    {
      cwd: installDir,
      timeout: 240_000,
      env: cleanEnvironment({
        HOME: join(tempRoot, "home-install"),
        npm_config_cache: join(tempRoot, "npm-cache-install"),
        npm_config_userconfig: join(tempRoot, "npmrc-install"),
        npm_config_ignore_scripts: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
      }),
    },
  );

  stage = "capture-lifecycle";
  run(process.execPath, [captureScript], {
    cwd: workspaceDir,
    timeout: 180_000,
    env: cleanEnvironment({
      HOME: join(tempRoot, "home-runtime"),
      PI_INSTALL_DIR: installDir,
      PI_LIFECYCLE_OUTPUT: captureOutput,
      PI_LIFECYCLE_WORKSPACE: workspaceDir,
      PI_LIFECYCLE_AGENT_DIR: agentDir,
      PI_LIFECYCLE_SCENARIO: scenario,
    }),
  });
  const capture = JSON.parse(await readFile(captureOutput, "utf8"));
  if (capture.status !== "passed") {
    throw new Error(`Lifecycle capture did not pass: ${JSON.stringify(capture.error ?? capture)}`);
  }
  if (capture.scenario !== scenario) {
    throw new Error(`Lifecycle capture scenario drift: expected ${scenario}, got ${capture.scenario}`);
  }

  stage = "compose-result";
  const result = {
    schemaVersion: 1,
    status: "passed",
    scenario,
    upstream: {
      repository: baseline.upstream.repository,
      releaseTag: baseline.upstream.releaseTag,
      commit: baseline.upstream.commit,
    },
    artifact: {
      name: packageName,
      version: packageVersion,
      integrity: actualIntegrity,
      shasum: actualShasum,
      installScriptsExecuted: false,
    },
    environment: {
      node: process.versions.node,
      npm: npmVersion,
      platform: `${process.platform}-${process.arch}`,
      containerImage: process.env.PI_PROBE_CONTAINER_IMAGE ?? "unknown",
    },
    isolation: {
      hostSecretsPassedToProbe: false,
      hostWorkspaceMounted: process.env.PI_PROBE_HOST_WORKSPACE_MOUNTED === "true",
      sourceBundleReadOnly: process.env.PI_PROBE_SOURCE_READ_ONLY === "true",
      containerRootFilesystemReadOnly: process.env.PI_PROBE_CONTAINER_ROOT_READ_ONLY === "true",
      containerCapabilitiesDropped: process.env.PI_PROBE_CAPABILITIES_DROPPED === "true",
      containerNoNewPrivileges: process.env.PI_PROBE_NO_NEW_PRIVILEGES === "true",
    },
    capture,
  };

  if (committedFixturePath) {
    stage = "compare-committed-fixture";
    const committed = JSON.parse(await readFile(committedFixturePath, "utf8"));
    if (stableFingerprintValue(committed) !== stableFingerprintValue(result)) {
      throw new Error(
        `Fresh lifecycle result differs from committed fixture: committed=${committed.contractFingerprint}, fresh=${sha256(stableFingerprintValue(result))}`,
      );
    }
  }

  await persist(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await main();
} catch (error) {
  const failure = {
    schemaVersion: 1,
    status: "failed",
    scenario,
    error: normalizeError(error),
    isolation: {
      hostSecretsPassedToProbe: false,
      hostWorkspaceMounted: process.env.PI_PROBE_HOST_WORKSPACE_MOUNTED === "true",
      sourceBundleReadOnly: process.env.PI_PROBE_SOURCE_READ_ONLY === "true",
      containerRootFilesystemReadOnly: process.env.PI_PROBE_CONTAINER_ROOT_READ_ONLY === "true",
      containerCapabilitiesDropped: process.env.PI_PROBE_CAPABILITIES_DROPPED === "true",
      containerNoNewPrivileges: process.env.PI_PROBE_NO_NEW_PRIVILEGES === "true",
    },
  };
  await persist(failure);
  console.error(`Pi lifecycle Artifact probe failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
} finally {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
}
