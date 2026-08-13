import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdtemp,
  open,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

export const DEFAULT_SDK_RPC_PARITY_MANIFEST =
  "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json";
export const SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES = 8 * 1024 * 1024;

const SDK_RPC_PARITY_MAX_COMPRESSED_BYTES =
  SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES + 64 * 1024;
const SDK_RPC_PARITY_MAX_BASE64_LENGTH =
  Math.ceil(SDK_RPC_PARITY_MAX_COMPRESSED_BYTES / 3) * 4;
const SDK_RPC_PARITY_MAX_MANIFEST_BYTES = 64 * 1024;
const SDK_RPC_PARITY_MAX_PART_LENGTH = 1024 * 1024;
const SDK_RPC_PARITY_MAX_PARTS = 99;
const SDK_RPC_PARITY_PACK_LOCK_NAME = ".pi-sdk-rpc-parity-fixture.pack.lock";
const SDK_RPC_PARITY_REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SDK_RPC_PARITY_RESULT_CHECKERS = [
  fileURLToPath(new URL("./check-pi-sdk-rpc-parity-result.mjs", import.meta.url)),
  fileURLToPath(new URL("./check-pi-sdk-rpc-client-messages-result.mjs", import.meta.url)),
];
const LEGACY_PART_NAME = /^part-(\d{2})\.b64$/;
const CONTENT_ADDRESSED_PART_NAME = /^part-(\d{2})-([0-9a-f]{64})\.b64$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function directoryIdentityError(guard, cause) {
  const error = new Error(
    `SDK/RPC Fixture ${guard.label} identity changed while packing: ${guard.path}.`,
    cause === undefined ? undefined : { cause },
  );
  error.directoryIdentityLost = true;
  error.preservePackLock = true;
  return error;
}

async function openDirectoryIdentity(path, label) {
  const before = await requireFixtureDirectory(path);
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(
      opened.isDirectory() && sameFileIdentity(before, opened),
      `SDK/RPC Fixture ${label} changed while it was opened: ${path}.`,
    );
    const afterPath = await lstat(path, { bigint: true });
    requireValue(
      afterPath.isDirectory() &&
        !afterPath.isSymbolicLink() &&
        sameFileIdentity(opened, afterPath),
      `SDK/RPC Fixture ${label} was replaced while it was opened: ${path}.`,
    );
    return { handle, identity: opened, label, path };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertDirectoryIdentity(guard) {
  try {
    const opened = await guard.handle.stat({ bigint: true });
    const atPath = await lstat(guard.path, { bigint: true });
    if (
      !opened.isDirectory() ||
      !sameFileIdentity(guard.identity, opened) ||
      !atPath.isDirectory() ||
      atPath.isSymbolicLink() ||
      !sameFileIdentity(guard.identity, atPath)
    ) {
      throw directoryIdentityError(guard);
    }
  } catch (error) {
    if (error?.directoryIdentityLost === true) throw error;
    throw directoryIdentityError(guard, error);
  }
}

async function assertPackDirectoryIdentities(parentGuard, baseGuard) {
  await assertDirectoryIdentity(parentGuard);
  await assertDirectoryIdentity(baseGuard);
}

function childPathThroughDirectory(guard, name) {
  requireValue(
    basename(name) === name && name !== "." && name !== "..",
    `SDK/RPC Fixture transaction child name is invalid: ${name}.`,
  );
  // Linux exposes a race-free path to a held directory descriptor. This keeps
  // writes bound to the opened Fixture even if its pathname is concurrently
  // replaced. Windows has no Node.js open-at equivalent, so the held handle is
  // the stable identity witness and pathname identity is checked immediately
  // before and after each transaction step. Both platforms reject a directory
  // replacement instead of continuing into the replacement tree.
  if (process.platform === "linux") {
    return join(`/proc/self/fd/${guard.handle.fd}`, name);
  }
  return join(guard.path, name);
}

async function requireFixtureDirectory(path) {
  const stats = await lstat(path, { bigint: true });
  requireValue(
    stats.isDirectory() && !stats.isSymbolicLink(),
    `SDK/RPC Fixture directory must be a real directory: ${path}.`,
  );
  return stats;
}

async function readRegularFile(path, { encoding, label, maxBytes } = {}) {
  const before = await lstat(path, { bigint: true });
  requireValue(
    before.isFile() && !before.isSymbolicLink(),
    `${label ?? "SDK/RPC Fixture file"} must be a regular file: ${path}.`,
  );
  if (maxBytes !== undefined) {
    requireValue(
      before.size <= BigInt(maxBytes),
      `${label ?? "SDK/RPC Fixture file"} exceeds its byte limit.`,
    );
  }

  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    requireValue(
      opened.isFile() && sameFileIdentity(before, opened),
      `${label ?? "SDK/RPC Fixture file"} changed while it was opened.`,
    );
    if (maxBytes !== undefined) {
      requireValue(
        opened.size <= BigInt(maxBytes),
        `${label ?? "SDK/RPC Fixture file"} exceeds its byte limit.`,
      );
    }
    let value;
    if (maxBytes === undefined) {
      value = await handle.readFile();
    } else {
      const chunks = [];
      let bytesReadTotal = 0;
      while (bytesReadTotal <= maxBytes) {
        const remaining = maxBytes + 1 - bytesReadTotal;
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        chunks.push(buffer.subarray(0, bytesRead));
        bytesReadTotal += bytesRead;
      }
      requireValue(
        bytesReadTotal <= maxBytes,
        `${label ?? "SDK/RPC Fixture file"} exceeds its byte limit.`,
      );
      value = Buffer.concat(chunks, bytesReadTotal);
    }
    const afterRead = await handle.stat({ bigint: true });
    requireValue(
      sameFileIdentity(opened, afterRead) && opened.size === afterRead.size,
      `${label ?? "SDK/RPC Fixture file"} changed while it was read.`,
    );
    const afterPath = await lstat(path, { bigint: true });
    requireValue(
      afterPath.isFile() &&
        !afterPath.isSymbolicLink() &&
        sameFileIdentity(opened, afterPath),
      `${label ?? "SDK/RPC Fixture file"} was replaced while it was read.`,
    );
    return encoding ? value.toString(encoding) : value;
  } finally {
    await handle.close();
  }
}

async function writeNewSyncedFile(path, value, mode = 0o644, directoryGuard) {
  let handle;
  try {
    if (directoryGuard) await assertDirectoryIdentity(directoryGuard);
    handle = await open(path, "wx", mode);
    await handle.writeFile(value);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (directoryGuard) await assertDirectoryIdentity(directoryGuard);
  } catch (error) {
    try {
      await handle?.close();
    } catch {
      // Preserve the write error.
    }
    if (handle) {
      try {
        if (directoryGuard) await assertDirectoryIdentity(directoryGuard);
        await rm(path);
      } catch {
        // Leave a fail-closed exclusive file for manual cleanup.
      }
    }
    throw error;
  }
}

async function syncFixtureDirectory(guard) {
  await assertDirectoryIdentity(guard);
  let syncUnsupported = false;
  try {
    await guard.handle.sync();
  } catch (error) {
    if (
      process.platform === "win32" &&
      error &&
      typeof error === "object" &&
      ["EPERM", "EINVAL", "ENOTSUP"].includes(error.code)
    ) {
      syncUnsupported = true;
    } else {
      throw error;
    }
  }
  await assertDirectoryIdentity(guard);
  return !syncUnsupported;
}

async function acquirePackLock(parentGuard) {
  const lockPath = join(parentGuard.path, SDK_RPC_PARITY_PACK_LOCK_NAME);
  const lockAccessPath = childPathThroughDirectory(
    parentGuard,
    SDK_RPC_PARITY_PACK_LOCK_NAME,
  );
  const token = `${randomUUID()}\n`;
  let created = false;
  try {
    await assertDirectoryIdentity(parentGuard);
    await writeNewSyncedFile(lockAccessPath, token, 0o600, parentGuard);
    created = true;
    await syncFixtureDirectory(parentGuard);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error(
        `SDK/RPC Fixture pack lock already exists: ${lockPath}. Verify that no packer is running before removing the regular lock file.`,
      );
    }
    if (created && error?.directoryIdentityLost !== true) {
      try {
        await assertDirectoryIdentity(parentGuard);
        await rm(lockAccessPath);
        await syncFixtureDirectory(parentGuard);
      } catch {
        // Preserve the original durability error; the lock remains fail-closed.
      }
    }
    throw error;
  }
  return { lockAccessPath, lockPath, token };
}

async function releasePackLock(parentGuard, lock) {
  await assertDirectoryIdentity(parentGuard);
  const value = await readRegularFile(lock.lockAccessPath, {
    encoding: "utf8",
    label: "SDK/RPC Fixture pack lock",
    maxBytes: 1024,
  });
  requireValue(value === lock.token, "SDK/RPC Fixture pack lock ownership changed.");
  await assertDirectoryIdentity(parentGuard);
  await rm(lock.lockAccessPath);
  await syncFixtureDirectory(parentGuard);
}

function validateManifestShape(manifest) {
  requireValue(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "SDK/RPC Fixture manifest must be an object.",
  );
  const expectedKeys = [
    "base64Length",
    "captureContractFingerprint",
    "compressedBytes",
    "compressedSha256",
    "format",
    "jsonBytes",
    "jsonSha256",
    "outerContractFingerprint",
    "partLength",
    "parts",
    "schemaVersion",
    "source",
  ];
  requireValue(
    JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(expectedKeys),
    "SDK/RPC Fixture manifest contains unknown or missing fields.",
  );
  requireValue(manifest.schemaVersion === 1, "SDK/RPC Fixture manifest schemaVersion must be 1.");
  requireValue(
    manifest.format === "gzip+base64-parts",
    "SDK/RPC Fixture manifest format must be gzip+base64-parts.",
  );
  requireValue(
    Array.isArray(manifest.parts) &&
      manifest.parts.length > 0 &&
      manifest.parts.length <= SDK_RPC_PARITY_MAX_PARTS,
    "SDK/RPC Fixture manifest part count is invalid.",
  );
  requireValue(
    new Set(manifest.parts).size === manifest.parts.length,
    "SDK/RPC Fixture manifest contains duplicate part names.",
  );
  requireValue(
    isPositiveSafeInteger(manifest.partLength) &&
      manifest.partLength <= SDK_RPC_PARITY_MAX_PART_LENGTH,
    "SDK/RPC Fixture manifest partLength is invalid.",
  );
  requireValue(
    isPositiveSafeInteger(manifest.base64Length) &&
      manifest.base64Length <= SDK_RPC_PARITY_MAX_BASE64_LENGTH &&
      manifest.base64Length % 4 === 0,
    "SDK/RPC Fixture manifest base64Length is invalid.",
  );
  requireValue(
    isPositiveSafeInteger(manifest.compressedBytes) &&
      manifest.compressedBytes <= SDK_RPC_PARITY_MAX_COMPRESSED_BYTES &&
      manifest.base64Length === Math.ceil(manifest.compressedBytes / 3) * 4,
    "SDK/RPC Fixture manifest compressed byte length is invalid.",
  );
  requireValue(
    isPositiveSafeInteger(manifest.jsonBytes) &&
      manifest.jsonBytes <= SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
    "SDK/RPC Fixture manifest JSON byte length is invalid.",
  );
  requireValue(
    manifest.parts.length === Math.ceil(manifest.base64Length / manifest.partLength),
    "SDK/RPC Fixture manifest part count differs from its declared lengths.",
  );
  for (const [field, value] of [
    ["compressedSha256", manifest.compressedSha256],
    ["jsonSha256", manifest.jsonSha256],
  ]) {
    requireValue(
      /^[0-9a-f]{64}$/.test(value ?? ""),
      `SDK/RPC Fixture manifest ${field} must be a lowercase SHA-256 digest.`,
    );
  }
  for (const [field, value] of [
    ["outerContractFingerprint", manifest.outerContractFingerprint],
    ["captureContractFingerprint", manifest.captureContractFingerprint],
  ]) {
    requireValue(
      /^[0-9a-f]{64}$/.test(value ?? ""),
      `SDK/RPC Fixture manifest ${field} must be a lowercase SHA-256 digest.`,
    );
  }

  let namingMode;
  for (const [index, partName] of manifest.parts.entries()) {
    const legacy = LEGACY_PART_NAME.exec(partName);
    const contentAddressed = CONTENT_ADDRESSED_PART_NAME.exec(partName);
    requireValue(
      legacy || contentAddressed,
      `SDK/RPC Fixture part name is invalid: ${partName}.`,
    );
    const mode = contentAddressed ? "content-addressed" : "legacy";
    namingMode ??= mode;
    requireValue(mode === namingMode, "SDK/RPC Fixture part naming modes must not be mixed.");
    const declaredIndex = Number((contentAddressed ?? legacy)[1]);
    requireValue(
      declaredIndex === index,
      `SDK/RPC Fixture part index drifted: ${partName}.`,
    );
  }
  return namingMode;
}

export function validateSdkRpcParitySource(source) {
  requireValue(
    source && typeof source === "object" && !Array.isArray(source),
    "SDK/RPC Fixture manifest source must be an object.",
  );
  const expectedKeys = ["artifactDigest", "artifactId", "head", "workflowRun"];
  requireValue(
    JSON.stringify(Object.keys(source).sort()) === JSON.stringify(expectedKeys),
    "SDK/RPC Fixture manifest source must contain exactly head, workflowRun, artifactId, and artifactDigest.",
  );
  requireValue(
    typeof source.head === "string" && /^[0-9a-f]{40}$/.test(source.head),
    "SDK/RPC Fixture manifest source.head must be a full lowercase commit SHA.",
  );

  const provenance = [source.workflowRun, source.artifactId, source.artifactDigest];
  const nullCount = provenance.filter((value) => value === null).length;
  if (nullCount === provenance.length) return "candidate";
  requireValue(
    nullCount === 0,
    "SDK/RPC Fixture manifest source provenance must be either entirely pending or entirely verified.",
  );
  for (const [field, value] of [
    ["workflowRun", source.workflowRun],
    ["artifactId", source.artifactId],
  ]) {
    requireValue(
      Number.isSafeInteger(value) && value > 0,
      `SDK/RPC Fixture manifest source.${field} must be a positive safe integer.`,
    );
  }
  requireValue(
    typeof source.artifactDigest === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(source.artifactDigest),
    "SDK/RPC Fixture manifest source.artifactDigest must be a lowercase SHA-256 digest.",
  );
  return "verified";
}

function canonicalResultValue(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function buildSdkRpcParityCandidate({ currentManifest, freshPath, sourceHead }) {
  const absoluteFreshPath = resolve(freshPath);
  const freshBytes = await readRegularFile(absoluteFreshPath, {
    label: "Fresh SDK/RPC result",
    maxBytes: SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
  });
  const freshText = freshBytes.toString("utf8");
  requireValue(
    Buffer.from(freshText, "utf8").equals(freshBytes),
    "Fresh SDK/RPC result must be valid UTF-8.",
  );
  const result = JSON.parse(freshText);
  requireValue(
    freshText === canonicalResultValue(result),
    "Fresh SDK/RPC result must use canonical pretty JSON with a trailing newline.",
  );
  for (const checkerPath of SDK_RPC_PARITY_RESULT_CHECKERS) {
    runChecker(checkerPath, absoluteFreshPath);
  }
  requireValue(
    /^[0-9a-f]{64}$/.test(result.contractFingerprint ?? "") &&
      /^[0-9a-f]{64}$/.test(result.capture?.contractFingerprint ?? ""),
    "Fresh SDK/RPC result fingerprints must be lowercase SHA-256 digests.",
  );

  const jsonBytes = Buffer.from(freshText, "utf8");
  const compressed = gzipSync(jsonBytes, { level: 9, mtime: 0 });
  // zlib writes a platform identifier into byte 9 even though the payload is
  // identical. Normalize it to Unix so Windows and Linux produce the same bytes.
  requireValue(
    compressed.length >= 10 &&
      compressed[0] === 0x1f &&
      compressed[1] === 0x8b &&
      compressed[2] === 8 &&
      compressed.subarray(4, 8).equals(Buffer.alloc(4)),
    "SDK/RPC Fixture gzip header is not deterministic.",
  );
  compressed[9] = 3;

  const base64 = compressed.toString("base64");
  const partContents = [];
  for (let offset = 0; offset < base64.length; offset += currentManifest.partLength) {
    partContents.push(base64.slice(offset, offset + currentManifest.partLength));
  }
  requireValue(
    partContents.length > 0 && partContents.length <= SDK_RPC_PARITY_MAX_PARTS,
    "SDK/RPC Fixture part count is invalid.",
  );
  const parts = partContents.map(
    (content, index) =>
      `part-${String(index).padStart(2, "0")}-${sha256(Buffer.from(content, "utf8"))}.b64`,
  );
  const manifest = {
    schemaVersion: 1,
    format: "gzip+base64-parts",
    parts,
    partLength: currentManifest.partLength,
    base64Length: base64.length,
    compressedBytes: compressed.length,
    compressedSha256: sha256(compressed),
    jsonBytes: jsonBytes.length,
    jsonSha256: sha256(jsonBytes),
    outerContractFingerprint: result.contractFingerprint,
    captureContractFingerprint: result.capture.contractFingerprint,
    source: {
      head: sourceHead,
      workflowRun: null,
      artifactId: null,
      artifactDigest: null,
    },
  };
  validateSdkRpcParitySource(manifest.source);
  validateManifestShape(manifest);
  return {
    jsonBytes,
    manifest,
    manifestText: `${JSON.stringify(manifest, null, 2)}\n`,
    partContents,
  };
}

async function validateStagedSdkRpcParityCandidate({
  baseGuard,
  jsonBytes,
  manifestText,
  stagedManifestPath,
}) {
  const staged = await readSdkRpcParityFixtureFromDirectory(
    stagedManifestPath,
    baseGuard,
  );
  requireValue(
    staged.manifestText === manifestText &&
      staged.jsonBytes.equals(jsonBytes) &&
      staged.sourceState === "candidate",
    "Staged SDK/RPC Fixture did not round-trip to the fresh candidate.",
  );

  const checkerDirectory = await mkdtemp(join(tmpdir(), "zhiwei-sdk-rpc-pack-check-"));
  try {
    const stagedResultPath = join(checkerDirectory, "result.json");
    await writeFile(stagedResultPath, staged.jsonBytes, { flag: "wx", mode: 0o600 });
    for (const checkerPath of SDK_RPC_PARITY_RESULT_CHECKERS) {
      runChecker(checkerPath, stagedResultPath);
    }
  } finally {
    await rm(checkerDirectory, { recursive: true, force: true });
  }
}

async function installSdkRpcParityCandidate({
  absoluteManifestPath,
  baseGuard,
  baseDir,
  currentManifest,
  currentManifestText,
  jsonBytes,
  manifest,
  manifestText,
  parentGuard,
  partContents,
}) {
  const transactionId = randomUUID();
  const manifestName = basename(absoluteManifestPath);
  let stagedManifestName = `.${manifestName}.pack-${transactionId}.tmp`;
  let rollbackManifestName = `.${manifestName}.pack-${transactionId}.rollback`;
  const createdParts = [];
  let manifestActivated = false;
  let manifestCommitted = false;
  let rollbackFailed = false;
  let primaryError;

  try {
    for (const [index, content] of partContents.entries()) {
      await assertPackDirectoryIdentities(parentGuard, baseGuard);
      const partName = manifest.parts[index];
      const partPath = childPathThroughDirectory(baseGuard, partName);
      try {
        await writeNewSyncedFile(partPath, content, 0o644, baseGuard);
        createdParts.push({ name: partName, content });
      } catch (error) {
        if (!error || typeof error !== "object" || error.code !== "EEXIST") throw error;
        const existing = await readRegularFile(partPath, {
          encoding: "utf8",
          label: `SDK/RPC Fixture content-addressed part ${partName}`,
          maxBytes: currentManifest.partLength,
        });
        requireValue(
          existing === content,
          `SDK/RPC Fixture content-addressed part ${partName} differs from its digest.`,
        );
      }
      await assertPackDirectoryIdentities(parentGuard, baseGuard);
    }
    await syncFixtureDirectory(baseGuard);

    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    const stagedManifestPath = join(baseDir, stagedManifestName);
    await writeNewSyncedFile(
      childPathThroughDirectory(baseGuard, stagedManifestName),
      manifestText,
      0o644,
      baseGuard,
    );
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    await validateStagedSdkRpcParityCandidate({
      baseGuard,
      jsonBytes,
      manifestText,
      stagedManifestPath,
    });
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    await writeNewSyncedFile(
      childPathThroughDirectory(baseGuard, rollbackManifestName),
      currentManifestText,
      0o644,
      baseGuard,
    );
    await syncFixtureDirectory(baseGuard);

    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    const beforeActivation = await readRegularFile(
      childPathThroughDirectory(baseGuard, manifestName),
      {
        encoding: "utf8",
        label: "SDK/RPC Fixture manifest",
        maxBytes: SDK_RPC_PARITY_MAX_MANIFEST_BYTES,
      },
    );
    requireValue(
      beforeActivation === currentManifestText,
      "SDK/RPC Fixture manifest changed during candidate staging.",
    );

    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    await rename(
      childPathThroughDirectory(baseGuard, stagedManifestName),
      childPathThroughDirectory(baseGuard, manifestName),
    );
    stagedManifestName = undefined;
    manifestActivated = true;
    await syncFixtureDirectory(baseGuard);
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    const packed = await readSdkRpcParityFixtureFromDirectory(
      absoluteManifestPath,
      baseGuard,
    );
    requireValue(
      packed.manifestText === manifestText &&
        packed.jsonBytes.equals(jsonBytes) &&
        packed.sourceState === "candidate",
      "Activated SDK/RPC Fixture did not round-trip to the fresh candidate.",
    );
    manifestCommitted = true;

    try {
      await assertPackDirectoryIdentities(parentGuard, baseGuard);
      await rm(childPathThroughDirectory(baseGuard, rollbackManifestName));
      rollbackManifestName = undefined;
      await syncFixtureDirectory(baseGuard);
      await assertPackDirectoryIdentities(parentGuard, baseGuard);
    } catch (error) {
      if (error?.directoryIdentityLost === true) throw error;
      console.warn(
        `SDK/RPC Fixture candidate is active, but transaction cleanup needs attention: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return packed;
  } catch (error) {
    primaryError = error;
    if (error?.directoryIdentityLost === true) {
      error.preservePackLock = true;
      throw error;
    }
    if (manifestActivated && !manifestCommitted && rollbackManifestName) {
      try {
        await assertPackDirectoryIdentities(parentGuard, baseGuard);
        await rename(
          childPathThroughDirectory(baseGuard, rollbackManifestName),
          childPathThroughDirectory(baseGuard, manifestName),
        );
        rollbackManifestName = undefined;
        manifestActivated = false;
        await syncFixtureDirectory(baseGuard);
        const restored = await readSdkRpcParityFixtureFromDirectory(
          absoluteManifestPath,
          baseGuard,
        );
        requireValue(
          restored.manifestText === currentManifestText,
          "SDK/RPC Fixture rollback manifest differs from the original.",
        );
      } catch (rollbackError) {
        rollbackFailed = true;
        const recoveryError = new AggregateError(
          [error, rollbackError],
          "SDK/RPC Fixture activation failed and its manifest rollback also failed.",
        );
        recoveryError.preservePackLock = true;
        throw recoveryError;
      }
    }
    if (!manifestActivated && !manifestCommitted) {
      for (const created of createdParts) {
        try {
          await assertPackDirectoryIdentities(parentGuard, baseGuard);
          const createdPath = childPathThroughDirectory(baseGuard, created.name);
          const current = await readRegularFile(createdPath, {
            encoding: "utf8",
            label: "Uncommitted SDK/RPC Fixture part",
            maxBytes: currentManifest.partLength,
          });
          if (current === created.content) await rm(createdPath);
        } catch (cleanupError) {
          if (cleanupError?.directoryIdentityLost === true) {
            error.preservePackLock = true;
            break;
          }
          // Preserve the primary error and leave a content-addressed orphan for manual cleanup.
        }
      }
    }
    throw error;
  } finally {
    let cleanupError;
    for (const temporaryName of [
      stagedManifestName,
      rollbackFailed ? undefined : rollbackManifestName,
    ]) {
      if (!temporaryName) continue;
      try {
        await assertPackDirectoryIdentities(parentGuard, baseGuard);
        await rm(childPathThroughDirectory(baseGuard, temporaryName), { force: true });
      } catch (error) {
        cleanupError ??= error;
        if (error?.directoryIdentityLost === true) break;
      }
    }
    if (cleanupError?.directoryIdentityLost === true && primaryError) {
      primaryError.preservePackLock = true;
    }
    if (!primaryError && cleanupError && !manifestCommitted) throw cleanupError;
    if (!primaryError && cleanupError && manifestCommitted) {
      if (cleanupError?.directoryIdentityLost === true) throw cleanupError;
      console.warn(
        `SDK/RPC Fixture candidate is active, but transaction cleanup needs attention: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
  }
}

export async function packSdkRpcParityFixture({
  manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST,
  freshPath,
  sourceHead,
  testHooks,
}) {
  requireValue(Boolean(freshPath), "SDK/RPC Fixture packing requires a fresh result path.");
  requireValue(
    /^[0-9a-f]{40}$/.test(sourceHead ?? ""),
    "SDK/RPC Fixture packing requires a full lowercase source HEAD.",
  );
  if (testHooks !== undefined) {
    requireValue(
      testHooks && typeof testHooks === "object" && !Array.isArray(testHooks),
      "SDK/RPC Fixture pack test hooks must be an object.",
    );
    requireValue(
      Object.keys(testHooks).every((key) => key === "afterPackLockAcquired") &&
        typeof testHooks.afterPackLockAcquired === "function",
      "SDK/RPC Fixture pack test hooks are invalid.",
    );
  }

  const absoluteManifestPath = resolve(manifestPath);
  const baseDir = dirname(absoluteManifestPath);
  const manifestName = basename(absoluteManifestPath);
  const parentDir = dirname(baseDir);
  let activated = false;
  let baseGuard;
  let lock;
  let parentGuard;
  let primaryError;
  let preservePackLock = false;
  try {
    parentGuard = await openDirectoryIdentity(parentDir, "Fixture parent directory");
    baseGuard = await openDirectoryIdentity(baseDir, "Fixture directory");
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    const currentFixture = await readSdkRpcParityFixtureFromDirectory(
      absoluteManifestPath,
      baseGuard,
    );
    const { manifest: currentManifest, manifestText: currentManifestText } =
      currentFixture;
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    lock = await acquirePackLock(parentGuard);
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    // This dependency-injection point is intentionally unavailable from the
    // CLI. It lets deterministic tests replace the directory exactly after the
    // parent-scoped lock exists, without timing-dependent polling.
    await testHooks?.afterPackLockAcquired({
      baseDir,
      lockPath: lock.lockPath,
      manifestPath: absoluteManifestPath,
    });
    await assertPackDirectoryIdentities(parentGuard, baseGuard);
    const lockedManifestText = await readRegularFile(
      childPathThroughDirectory(baseGuard, manifestName),
      {
        encoding: "utf8",
        label: "SDK/RPC Fixture manifest",
        maxBytes: SDK_RPC_PARITY_MAX_MANIFEST_BYTES,
      },
    );
    requireValue(
      lockedManifestText === currentManifestText,
      "SDK/RPC Fixture manifest changed before the pack lock was acquired; retry the pack.",
    );
    const candidate = await buildSdkRpcParityCandidate({
      currentManifest,
      freshPath,
      sourceHead,
    });
    const packed = await installSdkRpcParityCandidate({
      absoluteManifestPath,
      baseGuard,
      baseDir,
      currentManifest,
      currentManifestText,
      parentGuard,
      ...candidate,
    });
    activated = true;
    return packed;
  } catch (error) {
    primaryError = error;
    preservePackLock =
      lock !== undefined &&
      (error?.preservePackLock === true || error?.directoryIdentityLost === true);
    throw error;
  } finally {
    let finalizationError;
    if (lock && !preservePackLock) {
      try {
        await releasePackLock(parentGuard, lock);
      } catch (releaseError) {
        if (primaryError) {
          finalizationError = new AggregateError(
            [primaryError, releaseError],
            "SDK/RPC Fixture pack failed and its lock could not be released.",
          );
        } else if (activated && releaseError?.directoryIdentityLost !== true) {
          console.warn(
            `SDK/RPC Fixture candidate is active, but its pack lock needs attention: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
          );
        } else {
          finalizationError = releaseError;
        }
      }
    }
    for (const guard of [baseGuard, parentGuard]) {
      try {
        await guard?.handle.close();
      } catch (closeError) {
        finalizationError ??= closeError;
      }
    }
    if (finalizationError) throw finalizationError;
  }
}

async function readSdkRpcParityFixtureFromDirectory(manifestPath, directoryGuard) {
  const absoluteManifestPath = resolve(manifestPath);
  const baseDir = dirname(absoluteManifestPath);
  if (directoryGuard) {
    requireValue(
      resolve(directoryGuard.path) === baseDir,
      "SDK/RPC Fixture guarded manifest must remain inside its opened directory.",
    );
    await assertDirectoryIdentity(directoryGuard);
  } else {
    await requireFixtureDirectory(baseDir);
  }
  const fixtureChildPath = (name) =>
    directoryGuard
      ? childPathThroughDirectory(directoryGuard, name)
      : join(baseDir, name);
  const manifestText = await readRegularFile(
    fixtureChildPath(basename(absoluteManifestPath)),
    {
      encoding: "utf8",
      label: "SDK/RPC Fixture manifest",
      maxBytes: SDK_RPC_PARITY_MAX_MANIFEST_BYTES,
    },
  );
  const manifest = JSON.parse(manifestText);
  const namingMode = validateManifestShape(manifest);
  const sourceState = validateSdkRpcParitySource(manifest.source);

  const partContents = [];
  for (const [index, partName] of manifest.parts.entries()) {
    if (directoryGuard) await assertDirectoryIdentity(directoryGuard);
    const content = await readRegularFile(fixtureChildPath(partName), {
      encoding: "utf8",
      label: `SDK/RPC Fixture part ${partName}`,
      maxBytes: manifest.partLength,
    });
    requireValue(
      /^[A-Za-z0-9+/]*={0,2}$/.test(content),
      `SDK/RPC Fixture part ${partName} is not canonical base64 text.`,
    );
    if (index < manifest.parts.length - 1) {
      requireValue(
        content.length === manifest.partLength,
        `SDK/RPC Fixture part ${partName} length drifted.`,
      );
    } else {
      requireValue(
        content.length > 0 && content.length <= manifest.partLength,
        `SDK/RPC Fixture final part ${partName} length drifted.`,
      );
    }
    if (namingMode === "content-addressed") {
      const expectedDigest = CONTENT_ADDRESSED_PART_NAME.exec(partName)[2];
      requireValue(
        sha256(Buffer.from(content, "utf8")) === expectedDigest,
        `SDK/RPC Fixture part ${partName} differs from its content digest.`,
      );
    }
    partContents.push(content);
  }

  const base64 = partContents.join("");
  requireValue(
    base64.length === manifest.base64Length,
    "SDK/RPC Fixture base64 length differs from the manifest.",
  );
  const compressed = Buffer.from(base64, "base64");
  requireValue(
    compressed.toString("base64") === base64,
    "SDK/RPC Fixture base64 text is not canonical.",
  );
  requireValue(
    compressed.length === manifest.compressedBytes,
    "SDK/RPC Fixture compressed byte length differs from the manifest.",
  );
  requireValue(
    sha256(compressed) === manifest.compressedSha256,
    "SDK/RPC Fixture compressed SHA-256 differs from the manifest.",
  );

  let jsonBytes;
  try {
    jsonBytes = gunzipSync(compressed, {
      maxOutputLength: SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
    });
  } catch {
    throw new Error("SDK/RPC Fixture compressed payload could not be safely decompressed.");
  }
  requireValue(
    jsonBytes.length === manifest.jsonBytes,
    "SDK/RPC Fixture JSON byte length differs from the manifest.",
  );
  requireValue(
    sha256(jsonBytes) === manifest.jsonSha256,
    "SDK/RPC Fixture JSON SHA-256 differs from the manifest.",
  );
  const jsonText = jsonBytes.toString("utf8");
  requireValue(
    Buffer.from(jsonText, "utf8").equals(jsonBytes),
    "SDK/RPC Fixture JSON is not valid UTF-8.",
  );
  const result = JSON.parse(jsonText);
  requireValue(
    canonicalResultValue(result) === jsonText,
    "SDK/RPC Fixture JSON is not canonical pretty JSON with a trailing newline.",
  );
  requireValue(
    result.contractFingerprint === manifest.outerContractFingerprint,
    "SDK/RPC Fixture outer fingerprint differs from the manifest.",
  );
  requireValue(
    result.capture?.contractFingerprint === manifest.captureContractFingerprint,
    "SDK/RPC Fixture nested capture fingerprint differs from the manifest.",
  );
  if (directoryGuard) await assertDirectoryIdentity(directoryGuard);
  return { manifest, manifestText, result, jsonBytes, sourceState };
}

export async function readSdkRpcParityFixture(
  manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST,
) {
  return readSdkRpcParityFixtureFromDirectory(manifestPath);
}

function runChecker(checkerPath, materializedPath) {
  const checker = spawnSync(process.execPath, [checkerPath, materializedPath], {
    cwd: SDK_RPC_PARITY_REPOSITORY_ROOT,
    stdio: "inherit",
  });
  if (checker.error) throw checker.error;
  if (checker.status !== 0) {
    throw new Error(`${checkerPath} exited with status ${checker.status}.`);
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST;
  let outputPath;
  let comparePath;
  let packPath;
  let sourceHead;
  let check = false;
  let requireVerifiedSource = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--manifest requires a path.");
      manifestPath = value;
    } else if (argument === "--output") {
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--output requires a path.");
      outputPath = value;
    } else if (argument === "--check") {
      check = true;
    } else if (argument === "--compare") {
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--compare requires a path.");
      comparePath = value;
    } else if (argument === "--pack") {
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--pack requires a path.");
      packPath = value;
    } else if (argument === "--source-head") {
      const value = args[++index];
      requireValue(Boolean(value) && !value.startsWith("--"), "--source-head requires a SHA.");
      sourceHead = value;
    } else if (argument === "--require-verified-source") {
      requireVerifiedSource = true;
    } else {
      throw new Error(`Unknown SDK/RPC Fixture argument: ${argument}`);
    }
  }
  requireValue(
    Boolean(outputPath) || Boolean(comparePath) || Boolean(packPath) || check || requireVerifiedSource,
    "Use --output <path>, --check, --compare <path>, --pack <path>, or --require-verified-source.",
  );
  if (packPath) {
    requireValue(
      !outputPath && !comparePath && !check && !requireVerifiedSource,
      "--pack cannot be combined with materialize, check, compare, or verified-source gates.",
    );
    const { manifest } = await packSdkRpcParityFixture({
      manifestPath,
      freshPath: packPath,
      sourceHead,
    });
    console.log(
      `SDK/RPC parity candidate packed (${manifest.jsonBytes} JSON bytes, ${manifest.compressedBytes} compressed bytes, ${manifest.parts.length} parts)`,
    );
    return;
  }
  requireValue(!sourceHead, "--source-head is only valid with --pack.");

  const { manifest, result, jsonBytes, sourceState } =
    await readSdkRpcParityFixture(manifestPath);
  if (requireVerifiedSource) {
    requireValue(
      sourceState === "verified",
      "SDK/RPC Fixture manifest source must be verified for this gate.",
    );
  }
  let temporaryDirectory;
  let materializedPath = outputPath ? resolve(outputPath) : undefined;
  try {
    if (!materializedPath && check) {
      temporaryDirectory = await mkdtemp(join(tmpdir(), "zhiwei-sdk-rpc-parity-"));
      materializedPath = join(temporaryDirectory, "result.json");
    }
    if (materializedPath) {
      await writeFile(materializedPath, jsonBytes);
    }
    if (check) {
      for (const checkerPath of SDK_RPC_PARITY_RESULT_CHECKERS) {
        runChecker(checkerPath, materializedPath);
      }
    }
    if (comparePath) {
      const freshBytes = await readRegularFile(resolve(comparePath), {
        label: "Fresh SDK/RPC comparison result",
        maxBytes: SDK_RPC_PARITY_MAX_RESULT_JSON_BYTES,
      });
      const freshText = freshBytes.toString("utf8");
      requireValue(
        Buffer.from(freshText, "utf8").equals(freshBytes),
        "Fresh SDK/RPC comparison result must be valid UTF-8.",
      );
      const fresh = JSON.parse(freshText);
      requireValue(
        canonicalResultValue(fresh) === freshText,
        "Fresh SDK/RPC comparison result must be canonical pretty JSON with a trailing newline.",
      );
      requireValue(
        canonicalResultValue(result) === freshText,
        `Fresh lifecycle result differs from committed fixture: committed=${result.contractFingerprint}, fresh=${fresh.contractFingerprint}.`,
      );
    }
    console.log(
      `SDK/RPC parity Fixture: OK (${manifest.jsonBytes} JSON bytes, ${manifest.compressedBytes} compressed bytes, ${sourceState} source)`,
    );
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
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
