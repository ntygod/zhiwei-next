import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  requireValue,
  validateCaptureEnvelope,
  validateOuter,
  validateSanitizedText,
} from "./rpc-worker-lifecycle-checks-common.mjs";
import {
  validateProtocolAndNormal,
  validateRestart,
} from "./rpc-worker-lifecycle-checks-success.mjs";
import {
  validatePreflight,
  validateProviderError,
} from "./rpc-worker-lifecycle-checks-errors.mjs";

const inputPath = resolve(
  process.argv[2] ??
    process.env.PI_RPC_WORKER_LIFECYCLE_OUTPUT ??
    "packages/pi-adapter/fixtures/pi-lifecycle-rpc-worker.json",
);
const MAX_BYTES = 4 * 1024 * 1024;
const violations = [];

async function readBounded(path) {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("RPC Worker evidence must be a regular file.");
  }
  if (before.size > BigInt(MAX_BYTES)) {
    throw new Error("RPC Worker evidence exceeds its byte limit.");
  }
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > BigInt(MAX_BYTES)
    ) {
      throw new Error("RPC Worker evidence changed while it was opened.");
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const buffer = Buffer.allocUnsafe(
        Math.min(64 * 1024, MAX_BYTES + 1 - total),
      );
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_BYTES) {
        throw new Error("RPC Worker evidence exceeds its byte limit.");
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    if (
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== opened.size
    ) {
      throw new Error("RPC Worker evidence changed while it was read.");
    }
    const bytes = Buffer.concat(chunks, total);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      throw new Error("RPC Worker evidence must be valid UTF-8.");
    }
    return text;
  } finally {
    await handle.close();
  }
}

const rawText = await readBounded(inputPath);
const result = JSON.parse(rawText);
validateOuter(violations, result);
validateCaptureEnvelope(violations, result.capture);
validateProtocolAndNormal(violations, result.capture);
validateRestart(violations, result.capture);
validatePreflight(violations, result.capture);
validateProviderError(violations, result.capture);
validateSanitizedText(violations, rawText);

const piInstallStrings = [];
(function collect(value) {
  if (typeof value === "string") {
    if (value.includes("<pi-install-dir>")) piInstallStrings.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collect(item);
  }
})(result);
requireValue(
  violations,
  piInstallStrings.length === 2 &&
    piInstallStrings.every(
      (value) =>
        value === result.capture?.cases?.preflightRejection?.response?.error,
    ),
  "Pi install placeholder escaped the duplicated preflight error.",
);

if (violations.length > 0) {
  console.error(
    "Pi RPC Worker lifecycle result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}
console.log(
  `Pi RPC Worker lifecycle boundaries: OK (${result.capture.contractFingerprint})`,
);
