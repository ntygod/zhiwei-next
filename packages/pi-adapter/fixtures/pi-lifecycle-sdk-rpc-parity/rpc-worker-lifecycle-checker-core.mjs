import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";

export const MAX_BYTES = 4 * 1024 * 1024;
export const violations = [];

export function requireValue(condition, message) {
  if (!condition) violations.push(message);
}
export function equal(actual, expected, message) {
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), message);
}
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function fingerprint(value) {
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return sha256(JSON.stringify(clone));
}
export function contiguous(records, label) {
  for (let index = 0; index < records.length; index += 1) {
    requireValue(
      records[index]?.sequence === index + 1,
      `${label} sequence drifted at ${index}.`,
    );
  }
}
export function increasing(values) {
  return values.every(
    (value, index) =>
      Number.isInteger(value) && (index === 0 || value > values[index - 1]),
  );
}
export function transcript(caseResult) {
  return Array.isArray(caseResult?.worker?.transcript)
    ? caseResult.worker.transcript
    : [];
}
export function actions(caseResult) {
  return Array.isArray(caseResult?.worker?.clientActions)
    ? caseResult.worker.clientActions
    : [];
}
export function responses(caseResult, id, command) {
  return transcript(caseResult).filter(
    (record) =>
      record.kind === "response" &&
      record.id === (id ?? null) &&
      (command === undefined || record.command === command),
  );
}
export function events(caseResult, type, predicate = () => true) {
  return transcript(caseResult).filter(
    (record) =>
      record.kind === "event" &&
      record.event?.type === type &&
      predicate(record.event),
  );
}
export function roles(messages) {
  return Array.isArray(messages)
    ? messages.map((message) => message?.role)
    : [];
}
export function texts(messages) {
  return Array.isArray(messages)
    ? messages.map((message) => message?.text ?? "")
    : [];
}

export async function readBounded(path) {
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
      throw new Error("RPC Worker evidence must be UTF-8.");
    }
    return text;
  } finally {
    await handle.close();
  }
}

export function validateWorker(caseResult, label, code, extensionRequired) {
  const records = transcript(caseResult);
  const hostActions = actions(caseResult);
  contiguous(records, `${label} transcript`);
  contiguous(hostActions, `${label} client actions`);
  requireValue(
    records.every((record) => record.kind !== "client"),
    `${label} mixed host actions into Worker transcript.`,
  );
  const boundaries = caseResult?.worker?.processBoundaries ?? [];
  equal(
    boundaries.map((boundary) => ({
      kind: boundary.kind,
      event: boundary.event,
      code: boundary.code,
      signal: boundary.signal,
      evidence: boundary.extensionShutdownRunIdentityMatched,
    })),
    [
      {
        kind: "process",
        event: "exit",
        code,
        signal: null,
        evidence: extensionRequired ? true : undefined,
      },
      {
        kind: "process",
        event: "close",
        code,
        signal: null,
        evidence: extensionRequired ? true : undefined,
      },
    ],
    `${label} process boundaries drifted.`,
  );
  requireValue(
    caseResult?.worker?.exitBeforeClose === true,
    `${label} exit must precede close.`,
  );
  requireValue(
    caseResult?.worker?.stderr?.present === false &&
      caseResult?.worker?.stderr?.length === 0 &&
      caseResult?.worker?.stderr?.sha256 === sha256(""),
    `${label} stderr drifted.`,
  );
}
