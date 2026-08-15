import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

const DIRECT_INTERNAL_PI_PACKAGES = Object.freeze([
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-client",
  "@earendil-works/pi-protocol",
  "@earendil-works/pi-tui",
]);
const LOCKED_INTERNAL_PI_PACKAGES = Object.freeze([
  ...DIRECT_INTERNAL_PI_PACKAGES,
  "@earendil-works/pi-telemetry",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function registryTarballUrl(packageName, version) {
  const tarballName = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
  return `https://registry.npmjs.org/${packageName}/-/${tarballName}-${version}.tgz`;
}

function validatePublishedShrinkwrap(manifest, shrinkwrap, packageName, packageVersion) {
  if (!isRecord(manifest) || manifest.name !== packageName || manifest.version !== packageVersion) {
    throw new Error(
      `Verified tarball manifest identity drift: expected ${packageName}@${packageVersion}.`,
    );
  }
  if (
    !isRecord(shrinkwrap) ||
    shrinkwrap.name !== packageName ||
    shrinkwrap.version !== packageVersion ||
    shrinkwrap.lockfileVersion !== 3 ||
    shrinkwrap.requires !== true ||
    !isRecord(shrinkwrap.packages)
  ) {
    throw new Error("Verified tarball npm-shrinkwrap root contract is invalid.");
  }

  const root = shrinkwrap.packages[""];
  if (
    !isRecord(root) ||
    root.name !== packageName ||
    root.version !== packageVersion ||
    !isRecord(root.dependencies)
  ) {
    throw new Error("Verified tarball npm-shrinkwrap root package entry is invalid.");
  }

  for (const [lockPath, entry] of Object.entries(shrinkwrap.packages)) {
    if (!isRecord(entry)) {
      throw new Error(`Verified tarball npm-shrinkwrap entry is invalid: ${lockPath || "<root>"}.`);
    }
    if (entry.link === true) {
      throw new Error(`Verified tarball npm-shrinkwrap contains a link entry: ${lockPath}.`);
    }
    if (
      typeof entry.resolved === "string" &&
      /^(?:file:|link:|workspace:|\.{0,2}\/|\/)/.test(entry.resolved)
    ) {
      throw new Error(
        `Verified tarball npm-shrinkwrap contains a local resolved value: ${lockPath}.`,
      );
    }
  }

  for (const internalPackage of DIRECT_INTERNAL_PI_PACKAGES) {
    const expectedRange = `^${packageVersion}`;
    if (
      manifest.dependencies?.[internalPackage] !== expectedRange ||
      root.dependencies[internalPackage] !== expectedRange
    ) {
      throw new Error(
        `Verified tarball internal dependency range drift: ${internalPackage}.`,
      );
    }
  }

  for (const internalPackage of LOCKED_INTERNAL_PI_PACKAGES) {
    const entry = shrinkwrap.packages[`node_modules/${internalPackage}`];
    if (
      !isRecord(entry) ||
      entry.version !== packageVersion ||
      entry.resolved !== registryTarballUrl(internalPackage, packageVersion)
    ) {
      throw new Error(
        `Verified tarball locked internal dependency drift: ${internalPackage}.`,
      );
    }
  }
}

function verifyShrinkwrapValidator() {
  const packageName = "@earendil-works/pi-coding-agent";
  const packageVersion = "0.84.1";
  const dependencies = Object.fromEntries(
    DIRECT_INTERNAL_PI_PACKAGES.map((name) => [name, `^${packageVersion}`]),
  );
  const packages = {
    "": { name: packageName, version: packageVersion, dependencies },
    ...Object.fromEntries(
      LOCKED_INTERNAL_PI_PACKAGES.map((name) => [
        `node_modules/${name}`,
        {
          version: packageVersion,
          resolved: registryTarballUrl(name, packageVersion),
        },
      ]),
    ),
  };
  const manifest = { name: packageName, version: packageVersion, dependencies };
  const shrinkwrap = {
    name: packageName,
    version: packageVersion,
    lockfileVersion: 3,
    requires: true,
    packages,
  };

  validatePublishedShrinkwrap(manifest, shrinkwrap, packageName, packageVersion);
  for (const mutate of [
    (value) => {
      value.packages["node_modules/@earendil-works/pi-ai"].version = "0.84.2";
    },
    (value) => {
      value.packages["node_modules/@earendil-works/pi-ai"].resolved = "file:../pi-ai";
    },
    (value) => {
      value.packages["node_modules/@earendil-works/pi-ai"].link = true;
    },
    (value) => {
      delete value.packages["node_modules/@earendil-works/pi-ai"];
    },
  ]) {
    const candidate = structuredClone(shrinkwrap);
    mutate(candidate);
    let rejected = false;
    try {
      validatePublishedShrinkwrap(manifest, candidate, packageName, packageVersion);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error("Published shrinkwrap validator accepted an invalid mutation.");
    }
  }
}

async function assertPathMissing(path, label) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists before the verified package view is created.`);
}

async function installPublishedPackageGraph({
  tarballPath,
  installDir,
  packageName,
  packageVersion,
  environment,
}) {
  stage = "extract-verified-artifact";
  const listing = run("tar", ["-tzf", tarballPath], {
    cwd: installDir,
    env: environment,
  }).stdout
    .split("\n")
    .filter(Boolean);
  if (
    listing.length === 0 ||
    !listing.includes("package/package.json") ||
    !listing.includes("package/npm-shrinkwrap.json") ||
    listing.some((entry) => {
      if (!entry.startsWith("package/")) return true;
      const normalizedEntry = entry.endsWith("/") ? entry.slice(0, -1) : entry;
      const segments = normalizedEntry.split("/");
      return segments.includes("..") || segments.includes("");
    })
  ) {
    throw new Error("Verified tarball has an unsafe or incomplete package entry set.");
  }
  const packageDir = join(installDir, "package");
  await mkdir(packageDir, { recursive: false });
  run(
    "tar",
    [
      "--extract",
      "--gzip",
      "--file",
      tarballPath,
      "--directory",
      packageDir,
      "--strip-components=1",
      "--no-same-owner",
      "--no-same-permissions",
    ],
    { cwd: packageDir, env: environment },
  );

  stage = "validate-published-shrinkwrap";
  const packageJsonPath = join(packageDir, "package.json");
  const publishedShrinkwrapPath = join(packageDir, "npm-shrinkwrap.json");
  const [packageJsonBefore, shrinkwrapBefore] = await Promise.all([
    readFile(packageJsonPath, "utf8"),
    readFile(publishedShrinkwrapPath, "utf8"),
  ]);
  const manifest = JSON.parse(packageJsonBefore);
  const shrinkwrap = JSON.parse(shrinkwrapBefore);
  validatePublishedShrinkwrap(manifest, shrinkwrap, packageName, packageVersion);

  const root = shrinkwrap.packages[""];
  const installManifest = {
    name: root.name,
    version: root.version,
    private: true,
    ...(root.dependencies ? { dependencies: root.dependencies } : {}),
    ...(root.optionalDependencies
      ? { optionalDependencies: root.optionalDependencies }
      : {}),
  };
  const installManifestText = `${JSON.stringify(installManifest, null, 2)}\n`;
  const installShrinkwrapPath = join(installDir, "npm-shrinkwrap.json");
  await Promise.all([
    writeFile(join(installDir, "package.json"), installManifestText, "utf8"),
    writeFile(installShrinkwrapPath, shrinkwrapBefore, "utf8"),
  ]);

  stage = "install-published-shrinkwrap";
  run(
    "npm",
    [
      "ci",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--omit=dev",
      "--install-strategy=hoisted",
    ],
    {
      cwd: installDir,
      timeout: 240_000,
      env: {
        ...environment,
        npm_config_ignore_scripts: "true",
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_omit: "dev",
      },
    },
  );

  stage = "verify-installed-package-graph";
  const [packageJsonAfter, publishedShrinkwrapAfter, installManifestAfter, installShrinkwrapAfter] =
    await Promise.all([
      readFile(packageJsonPath, "utf8"),
      readFile(publishedShrinkwrapPath, "utf8"),
      readFile(join(installDir, "package.json"), "utf8"),
      readFile(installShrinkwrapPath, "utf8"),
    ]);
  if (packageJsonAfter !== packageJsonBefore) {
    throw new Error("Installing the published dependency graph changed package.json.");
  }
  if (publishedShrinkwrapAfter !== shrinkwrapBefore) {
    throw new Error("Installing the dependency graph changed the published npm-shrinkwrap.json.");
  }
  if (installManifestAfter !== installManifestText) {
    throw new Error("Installing the dependency graph changed the isolated root package.json.");
  }
  if (installShrinkwrapAfter !== shrinkwrapBefore) {
    throw new Error("Installing the dependency graph changed the isolated npm-shrinkwrap.json.");
  }

  for (const internalPackage of LOCKED_INTERNAL_PI_PACKAGES) {
    const installedManifest = JSON.parse(
      await readFile(
        join(installDir, "node_modules", ...internalPackage.split("/"), "package.json"),
        "utf8",
      ),
    );
    if (
      installedManifest.name !== internalPackage ||
      installedManifest.version !== packageVersion
    ) {
      throw new Error(
        `Installed internal Pi dependency drift: ${installedManifest.name}@${installedManifest.version}.`,
      );
    }
  }

  const packageSegments = packageName.split("/");
  const packageView = join(installDir, "node_modules", ...packageSegments);
  await assertPathMissing(packageView, "Verified package view");
  await mkdir(dirname(packageView), { recursive: true });

  const binPath = manifest.bin?.pi;
  if (typeof binPath !== "string" || !binPath) {
    throw new Error("Verified package manifest is missing the pi executable.");
  }
  await chmod(join(packageDir, binPath), 0o755);
  run("mv", [packageDir, packageView], { cwd: installDir, env: environment });

  const executable = join(installDir, "node_modules", ".bin", "pi");
  await mkdir(dirname(executable), { recursive: true });
  await assertPathMissing(executable, "Verified package executable");
  await symlink(`../${packageName}/${binPath}`, executable, "file");
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

  verifyShrinkwrapValidator();
  await installPublishedPackageGraph({
    tarballPath,
    installDir,
    packageName,
    packageVersion,
    environment: cleanEnvironment({
      HOME: join(tempRoot, "home-install"),
      npm_config_cache: join(tempRoot, "npm-cache-install"),
      npm_config_userconfig: join(tempRoot, "npmrc-install"),
      npm_config_ignore_scripts: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
    }),
  });

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
