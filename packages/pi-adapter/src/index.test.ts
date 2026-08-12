import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { normalizePiEvent } from "./index.ts";
import { ids } from "../../domain/src/index.ts";
import {
  extractSdkRpcParityResultJson,
  validateSdkRpcParityArtifactContent,
  validateSdkRpcParityProvenance,
} from "../../../scripts/check-pi-sdk-rpc-parity-provenance.mjs";
import {
  packSdkRpcParityFixture,
  readSdkRpcParityFixture,
  SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
  validateSdkRpcParitySource,
} from "../../../scripts/pi-sdk-rpc-parity-fixture.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sdkRpcManifestPath = join(
  repositoryRoot,
  "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json",
);
const sdkRpcParentLockName = ".pi-sdk-rpc-parity-fixture.pack.lock";

async function temporarySdkRpcFixture(t: test.TestContext): Promise<{
  root: string;
  manifestPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "zhiwei-sdk-rpc-fixture-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixtureDir = join(root, "fixture");
  await cp(dirname(sdkRpcManifestPath), fixtureDir, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
  });
  return { root, manifestPath: join(fixtureDir, "manifest.json") };
}

async function fixtureDirectorySnapshot(
  fixtureDir: string,
): Promise<Array<[string, Buffer]>> {
  return Promise.all(
    (await readdir(fixtureDir))
      .sort()
      .map(async (name): Promise<[string, Buffer]> => [
        name,
        await readFile(join(fixtureDir, name)),
      ]),
  );
}

async function assertFixtureDirectorySnapshot(
  fixtureDir: string,
  expected: Array<[string, Buffer]>,
): Promise<void> {
  assert.deepEqual((await readdir(fixtureDir)).sort(), expected.map(([name]) => name));
  for (const [name, bytes] of expected) {
    assert.deepEqual(await readFile(join(fixtureDir, name)), bytes);
  }
}

function snapshotMap(snapshot: Array<[string, Buffer]>): Map<string, Buffer> {
  return new Map(snapshot);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parityFingerprint(value: unknown): string {
  const clone = structuredClone(value) as Record<string, unknown>;
  delete clone.contractFingerprint;
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

function currentSdkRpcParityResult(result: any): any {
  const current = structuredClone(result);
  const surface = current.capture.cases.surface;
  if (!surface.rpcClient.requiredMethods.includes("collectEvents")) {
    surface.rpcClient.requiredMethods.splice(1, 0, "collectEvents");
    surface.rpcClient.requiredMethods.splice(6, 0, "getStderr");
  }
  if (!surface.files.some((file: any) => file.path.endsWith("rpc-client.d.ts"))) {
    surface.files.splice(4, 0, {
      path: "dist/modes/rpc/rpc-client.d.ts",
      size: 7268,
      sha256: "8e544a7e33fb79134f7460f1fb83fdf8af2e0045c6abf6278bdedc4b60d091ae",
    });
  }
  surface.structuredSignals = {
    rootIndexReexportsModes: true,
    rpcEntryForcesRpcMode: true,
    modesIndexExportsRunRpcMode: true,
    modesIndexExportsRpcClient: true,
    rpcClientUsesStrictJsonlHelpers: true,
    rpcClientProcessFieldDeclaredPrivate: true,
    rpcClientStopRequestsSigterm: true,
    rpcClientStopHasSigkillFallback: true,
    rpcModeEmitsPromptResponse: true,
    rpcModeExposesSettledEvent: true,
    rpcModeExposesStateAndMessages: true,
    jsonlUsesLfOnlyBuffering: true,
  };

  const rpc = current.capture.cases.rpc;
  rpc.extensionEvidence = { ...rpc.extensionEvidence, runIdentityMatched: true };
  rpc.worker = {
    processBoundaries: ["exit", "close"].map((type, index) => ({
      sequence: index + 1,
      type,
      code: 0,
      signal: null,
      extensionShutdownRunIdentityMatched: true,
    })),
    exit: rpc.worker.exit,
    close: rpc.worker.close,
    exitBeforeClose: true,
    extensionShutdownRunIdentityMatchedAtExit: true,
    extensionShutdownRunIdentityMatchedAtClose: true,
    stdinClosedByHost: rpc.worker.stdinClosedByHost,
    stdoutRemainderLength: rpc.worker.stdoutRemainderLength,
    stderrPresent: rpc.worker.stderrPresent,
    stderrLength: rpc.worker.stderrLength,
    stderrSha256: rpc.worker.stderrSha256,
  };

  const rpcClient = current.capture.cases.rpcClientMessages;
  rpcClient.extensionEvidence = {
    ...rpcClient.extensionEvidence,
    runIdentityMatched: true,
  };
  rpcClient.shutdown = {
    mechanism: "RpcClient.stop",
    instrumentationSurface: "published-js-private-process-field",
    requestedSignals: [{ signal: "SIGTERM", accepted: true }],
    process: {
      processBoundaries: ["exit", "close"].map((type, index) => ({
        sequence: index + 1,
        type,
        code: 143,
        signal: null,
        extensionShutdownRunIdentityMatched: true,
      })),
    },
    stderrPresent: false,
    stderrLength: 0,
    stderrSha256: rpcClient.shutdown.stderrSha256,
  };
  current.capture.contractFingerprint = parityFingerprint(current.capture);
  current.contractFingerprint = parityFingerprint(current);
  return current;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(
  name: string,
  content: Buffer,
  options: { dataDescriptor?: boolean; gap?: Buffer } = {},
): Buffer {
  const filename = Buffer.from(name, "utf8");
  const checksum = crc32(content);
  const flags = options.dataDescriptor ? 0x0008 : 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  if (!options.dataDescriptor) {
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
  }
  local.writeUInt16LE(filename.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(filename.length, 28);

  const descriptor = options.dataDescriptor ? Buffer.alloc(16) : Buffer.alloc(0);
  if (options.dataDescriptor) {
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(checksum, 4);
    descriptor.writeUInt32LE(content.length, 8);
    descriptor.writeUInt32LE(content.length, 12);
  }
  const gap = options.gap ?? Buffer.alloc(0);
  const centralOffset =
    local.length + filename.length + content.length + descriptor.length + gap.length;
  const centralSize = central.length + filename.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, content, descriptor, gap, central, filename, end]);
}

test("Pi input is normalized without exposing Pi-specific types to the protocol", () => {
  const event = normalizePiEvent(
    { type: "input", text: "记住这个项目使用 TypeScript" },
    {
      eventId: "event-1",
      sessionId: ids.session("session-1"),
      workspaceId: ids.workspace("workspace-1"),
      occurredAt: "2026-08-11T12:00:00.000Z",
    },
  );

  assert.equal(event.type, "input.observed");
  assert.equal(event.runtime, "pi");
  assert.deepEqual(event.observation.payload, { text: "记住这个项目使用 TypeScript" });
});

test("SDK/RPC Fixture provenance accepts only complete candidate or verified states", () => {
  const head = "b1521b10af25caf88d5a43acd58149be089ca86f";
  const candidate = {
    head,
    workflowRun: null,
    artifactId: null,
    artifactDigest: null,
  };
  const verified = {
    head,
    workflowRun: 31614817292,
    artifactId: 9148765803,
    artifactDigest: `sha256:${"a".repeat(64)}`,
  };

  assert.equal(validateSdkRpcParitySource(candidate), "candidate");
  assert.equal(validateSdkRpcParitySource(verified), "verified");

  for (const invalid of [
    null,
    [],
    { ...candidate, head: head.toUpperCase() },
    { ...candidate, head: head.slice(1) },
    { ...candidate, head: [head] },
    { ...candidate, workflowRun: 1 },
    { ...candidate, artifactId: 1 },
    { ...candidate, artifactDigest: `sha256:${"a".repeat(64)}` },
    { ...verified, artifactId: "9148765803" },
    { ...verified, workflowRun: 0 },
    { ...verified, workflowRun: -1 },
    { ...verified, workflowRun: Number.MAX_SAFE_INTEGER + 1 },
    { ...verified, artifactId: 1.5 },
    { ...verified, artifactId: 0 },
    { ...verified, artifactDigest: "a".repeat(64) },
    { ...verified, artifactDigest: `sha256:${"a".repeat(63)}` },
    { ...verified, artifactDigest: `sha256:${"A".repeat(64)}` },
    { ...verified, artifactDigest: [verified.artifactDigest] },
    { ...verified, artifactName: "unexpected" },
    { head, workflowRun: null, artifactId: null },
  ]) {
    assert.throws(() => validateSdkRpcParitySource(invalid));
  }
});

test("SDK/RPC Fixture loader rejects non-regular parts", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const original = await readSdkRpcParityFixture(manifestPath);
  const firstPartPath = join(dirname(manifestPath), original.manifest.parts[0]);
  const firstPart = await readFile(firstPartPath, "utf8");
  await rm(firstPartPath);
  await mkdir(firstPartPath);

  await assert.rejects(
    readSdkRpcParityFixture(manifestPath),
    /must be a regular file/,
  );
  assert.equal(firstPart.length, original.manifest.partLength);

});

test("SDK/RPC Fixture packer rejects results beyond the provenance byte limit", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const oversizedPath = join(root, "oversized.json");
  await writeFile(
    oversizedPath,
    Buffer.alloc(SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES + 1, 0x20),
  );
  await assert.rejects(
    packSdkRpcParityFixture({
      manifestPath,
      freshPath: oversizedPath,
      sourceHead: "a".repeat(40),
    }),
    /byte limit/,
  );
});

test("SDK/RPC Fixture loader bounds high-compression output before parsing", async (t) => {
  const { manifestPath } = await temporarySdkRpcFixture(t);
  const fixtureDir = dirname(manifestPath);
  const oversized = Buffer.alloc(SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES + 1, 0x20);
  const compressed = gzipSync(oversized, { level: 9, mtime: 0 });
  const base64 = compressed.toString("base64");
  const partLength = 2400;
  const parts = [];
  for (let offset = 0; offset < base64.length; offset += partLength) {
    const partName = `part-${String(parts.length).padStart(2, "0")}.b64`;
    parts.push(partName);
    await writeFile(join(fixtureDir, partName), base64.slice(offset, offset + partLength));
  }
  const digest = (value: Buffer): string =>
    createHash("sha256").update(value).digest("hex");
  const manifest = {
    schemaVersion: 1,
    format: "gzip+base64-parts",
    parts,
    partLength,
    base64Length: base64.length,
    compressedBytes: compressed.length,
    compressedSha256: digest(compressed),
    jsonBytes: SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
    jsonSha256: digest(oversized),
    outerContractFingerprint: "a".repeat(64),
    captureContractFingerprint: "b".repeat(64),
    source: {
      head: "c".repeat(40),
      workflowRun: null,
      artifactId: null,
      artifactDigest: null,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    readSdkRpcParityFixture(manifestPath),
    /could not be safely decompressed/,
  );
});

test("SDK/RPC Fixture pack lock fails closed without changing the active Fixture", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const fixtureDir = dirname(manifestPath);
  const before = await fixtureDirectorySnapshot(fixtureDir);
  const lockPath = join(root, sdkRpcParentLockName);
  await writeFile(lockPath, "existing lock\n", { flag: "wx" });
  await assert.rejects(
    packSdkRpcParityFixture({
      manifestPath,
      freshPath: manifestPath,
      sourceHead: "a".repeat(40),
    }),
    /pack lock already exists/,
  );
  await assertFixtureDirectorySnapshot(fixtureDir, before);
  assert.equal((await lstat(lockPath)).isFile(), true);
});

test("SDK/RPC Fixture packer rejects a directory replacement without moving its lock", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const fixtureDir = dirname(manifestPath);
  const movedFixtureDir = join(root, "fixture-moved");
  const preparedFixtureDir = join(root, "fixture-replacement");
  const before = await fixtureDirectorySnapshot(fixtureDir);
  await cp(fixtureDir, preparedFixtureDir, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
  });
  const lockPath = join(root, sdkRpcParentLockName);
  let replacementBefore: Array<[string, Buffer]> = [];
  let renameError: unknown;
  let secondPackerRejected = false;
  let swapped = false;

  let packError: unknown;
  try {
    await packSdkRpcParityFixture({
      manifestPath,
      freshPath: manifestPath,
      sourceHead: "a".repeat(40),
      testHooks: {
        afterPackLockAcquired: async () => {
          try {
            await rename(fixtureDir, movedFixtureDir);
          } catch (error) {
            renameError = error;
            throw error;
          }
          swapped = true;
          await rename(preparedFixtureDir, fixtureDir);
          replacementBefore = await fixtureDirectorySnapshot(fixtureDir);
          await assert.rejects(
            packSdkRpcParityFixture({
              manifestPath,
              freshPath: manifestPath,
              sourceHead: "b".repeat(40),
            }),
            /pack lock already exists/,
          );
          secondPackerRejected = true;
        },
      },
    });
    assert.fail("directory replacement must reject the pack");
  } catch (error) {
    packError = error;
  }

  if (!swapped) {
    assert.equal(
      process.platform,
      "win32",
      `directory rename was unexpectedly blocked: ${errorText(renameError)}`,
    );
    assert.equal(packError, renameError);
    await assertFixtureDirectorySnapshot(fixtureDir, before);
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
    return;
  }

  assert.match(errorText(packError), /Fixture directory identity changed while packing/);
  assert.equal(secondPackerRejected, true);
  await assertFixtureDirectorySnapshot(fixtureDir, replacementBefore);
  await assertFixtureDirectorySnapshot(movedFixtureDir, before);
  assert.equal((await lstat(lockPath)).isFile(), true);
});

test("SDK/RPC Fixture packer never follows a replacement directory symlink", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const fixtureDir = dirname(manifestPath);
  const movedFixtureDir = join(root, "fixture-moved");
  const symlinkTargetDir = join(root, "symlink-target");
  const before = await fixtureDirectorySnapshot(fixtureDir);
  await cp(fixtureDir, symlinkTargetDir, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
  });
  const targetBefore = await fixtureDirectorySnapshot(symlinkTargetDir);
  const lockPath = join(root, sdkRpcParentLockName);
  let renameError: unknown;
  let swapped = false;

  let packError: unknown;
  try {
    await packSdkRpcParityFixture({
      manifestPath,
      freshPath: manifestPath,
      sourceHead: "a".repeat(40),
      testHooks: {
        afterPackLockAcquired: async () => {
          try {
            await rename(fixtureDir, movedFixtureDir);
          } catch (error) {
            renameError = error;
            throw error;
          }
          swapped = true;
          await symlink(
            symlinkTargetDir,
            fixtureDir,
            process.platform === "win32" ? "junction" : "dir",
          );
        },
      },
    });
    assert.fail("directory symlink replacement must reject the pack");
  } catch (error) {
    packError = error;
  }

  if (!swapped) {
    assert.equal(
      process.platform,
      "win32",
      `directory rename was unexpectedly blocked: ${errorText(renameError)}`,
    );
    assert.equal(packError, renameError);
    await assertFixtureDirectorySnapshot(fixtureDir, before);
    await assertFixtureDirectorySnapshot(symlinkTargetDir, targetBefore);
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
    return;
  }

  assert.match(errorText(packError), /Fixture directory identity changed while packing/);
  assert.equal((await lstat(fixtureDir)).isSymbolicLink(), true);
  await assertFixtureDirectorySnapshot(symlinkTargetDir, targetBefore);
  await assertFixtureDirectorySnapshot(movedFixtureDir, before);
  assert.equal((await lstat(lockPath)).isFile(), true);
});

test("SDK/RPC Fixture packer retains parts referenced by an in-flight reader", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const fixtureDir = dirname(manifestPath);
  const before = await fixtureDirectorySnapshot(fixtureDir);
  const oldFiles = snapshotMap(before);
  const current = await readSdkRpcParityFixture(manifestPath);
  const freshPath = join(root, "fresh.json");
  const fresh = currentSdkRpcParityResult(current.result);
  await writeFile(freshPath, `${JSON.stringify(fresh, null, 2)}\n`);

  await packSdkRpcParityFixture({
    manifestPath,
    freshPath,
    sourceHead: "a".repeat(40),
  });

  for (const partName of current.manifest.parts) {
    assert.deepEqual(await readFile(join(fixtureDir, partName)), oldFiles.get(partName));
  }
});

test("SDK/RPC Fixture checker paths are anchored outside the caller CWD", async (t) => {
  const { root, manifestPath } = await temporarySdkRpcFixture(t);
  const beforeManifest = (await readSdkRpcParityFixture(manifestPath)).manifest;
  const caller = join(root, "caller");
  await mkdir(join(caller, "scripts"), { recursive: true });
  for (const name of [
    "check-pi-sdk-rpc-parity-result.mjs",
    "check-pi-sdk-rpc-client-messages-result.mjs",
  ]) {
    await writeFile(join(caller, "scripts", name), "", "utf8");
  }
  const invalidFreshPath = join(root, "invalid.json");
  await writeFile(
    invalidFreshPath,
    `${JSON.stringify({ status: "failed", capture: { contractFingerprint: "0".repeat(64) } }, null, 2)}\n`,
  );

  const scriptPath = join(repositoryRoot, "scripts/pi-sdk-rpc-parity-fixture.mjs");
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--manifest",
      manifestPath,
      "--pack",
      invalidFreshPath,
      "--source-head",
      "a".repeat(40),
    ],
    { cwd: caller, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Pi SDK\/RPC parity result violations/);
  assert.deepEqual((await readSdkRpcParityFixture(manifestPath)).manifest, beforeManifest);
});

test("SDK/RPC live provenance binds the successful run and Artifact to the current PR", () => {
  const repository = "ntygod/zhiwei-next";
  const source = {
    head: "a".repeat(40),
    workflowRun: 31614817292,
    artifactId: 9148765803,
    artifactDigest: `sha256:${"b".repeat(64)}`,
  };
  const eventPullRequest = {
    number: 60,
    headRef: "spike/45-sdk-rpc-parity",
    headSha: "c".repeat(40),
  };
  const pullRequest = {
    number: 60,
    state: "open",
    draft: false,
    base: { repo: { full_name: repository } },
    head: {
      repo: { full_name: repository },
      ref: eventPullRequest.headRef,
      sha: eventPullRequest.headSha,
    },
  };
  const run = {
    id: source.workflowRun,
    name: "Pi SDK and RPC parity contract",
    path: ".github/workflows/pi-sdk-rpc-parity.yml",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    head_sha: source.head,
    repository: { id: 1, full_name: repository },
    head_repository: { id: 1, full_name: repository },
    workflow_id: 2,
    run_attempt: 1,
    pull_requests: [{ number: 60 }],
  };
  const workflow = {
    id: run.workflow_id,
    name: run.name,
    path: run.path,
    state: "active",
  };
  const artifact = {
    id: source.artifactId,
    name: `pi-sdk-rpc-parity-probe-${source.workflowRun}-${run.run_attempt}`,
    expired: false,
    expires_at: "2026-08-27T00:00:00.000Z",
    digest: source.artifactDigest,
    workflow_run: {
      id: source.workflowRun,
      head_sha: source.head,
      repository_id: run.repository.id,
      head_repository_id: run.head_repository.id,
    },
  };
  const comparison = {
    status: "ahead",
    behind_by: 0,
    ahead_by: 1,
    base_commit: { sha: source.head },
    merge_base_commit: { sha: source.head },
  };
  const input = {
    source,
    repository,
    eventPullRequest,
    pullRequest,
    run,
    workflow,
    artifact,
    comparison,
    now: Date.parse("2026-08-13T00:00:00.000Z"),
  };

  assert.equal(validateSdkRpcParityProvenance(input).artifactId, source.artifactId);
  for (const mutate of [
    (invalid) => (invalid.run.conclusion = "failure"),
    (invalid) => (invalid.comparison.behind_by = 1),
    (invalid) => (invalid.artifact.digest = `sha256:${"d".repeat(64)}`),
    (invalid) => (invalid.pullRequest.head.sha = "e".repeat(40)),
  ]) {
    const invalid = structuredClone(input);
    mutate(invalid);
    assert.throws(() => validateSdkRpcParityProvenance(invalid));
  }
});

test("SDK/RPC live provenance binds downloaded Artifact content to Fixture bytes", () => {
  const fixtureBytes = Buffer.from('{\n  "status": "passed"\n}\n', "utf8");
  const archive = storedZip("result.json", fixtureBytes);
  const source = {
    artifactDigest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
  };
  const manifest = {
    jsonSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  };

  assert.deepEqual(extractSdkRpcParityResultJson(archive), fixtureBytes);
  assert.deepEqual(
    extractSdkRpcParityResultJson(storedZip("result.json", fixtureBytes, { dataDescriptor: true })),
    fixtureBytes,
  );
  assert.equal(
    validateSdkRpcParityArtifactContent({
      source,
      manifest,
      fixtureJsonBytes: fixtureBytes,
      artifactZipBytes: archive,
    }).resultJsonSha256,
    manifest.jsonSha256,
  );

  assert.throws(() =>
    validateSdkRpcParityArtifactContent({
      source,
      manifest: {
        jsonSha256: createHash("sha256").update("different").digest("hex"),
      },
      fixtureJsonBytes: fixtureBytes,
      artifactZipBytes: archive,
    }),
  );
  assert.throws(() => extractSdkRpcParityResultJson(storedZip("other.json", fixtureBytes)));
  assert.throws(() => extractSdkRpcParityResultJson(Buffer.concat([archive, Buffer.from([0])])));

  for (const localFieldOffset of [14, 18, 22]) {
    const invalidLocalIntegrity = Buffer.from(archive);
    invalidLocalIntegrity.writeUInt32LE(
      (invalidLocalIntegrity.readUInt32LE(localFieldOffset) ^ 1) >>> 0,
      localFieldOffset,
    );
    assert.throws(() => extractSdkRpcParityResultJson(invalidLocalIntegrity));
  }

  const invalidDescriptor = storedZip("result.json", fixtureBytes, { dataDescriptor: true });
  const descriptorOffset = 30 + Buffer.byteLength("result.json") + fixtureBytes.length;
  invalidDescriptor.writeUInt32LE(0, descriptorOffset);
  assert.throws(() => extractSdkRpcParityResultJson(invalidDescriptor));

  assert.throws(() =>
    extractSdkRpcParityResultJson(
      storedZip("result.json", fixtureBytes, { gap: Buffer.from([0]) }),
    ),
  );
});
