import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ContentFileErrorV2,
  ContentFilesV2,
  type ContentFileErrorCodeV2,
  type ContentFileKeyV2,
} from "./content-files-v2.ts";

const KEY: ContentFileKeyV2 = {
  contentId: "00000000-0000-4000-8000-000000000001",
  version: 1,
  reservationId: "00000000-0000-4000-8000-000000000002",
};
const OTHER_KEY: ContentFileKeyV2 = {
  contentId: "00000000-0000-4000-8000-000000000003",
  version: 2,
  reservationId: "00000000-0000-4000-8000-000000000004",
};
const BODY = Buffer.from("A fictional garden contains three blue flowers.");

function code(expected: ContentFileErrorCodeV2): (error: unknown) => boolean {
  return (error) => {
    assert.ok(error instanceof ContentFileErrorV2);
    assert.equal(error.code, expected);
    assert.equal(error.cause, undefined);
    assert.ok(!error.message.includes(tmpdir()));
    assert.ok(!error.message.includes(BODY.toString()));
    return true;
  };
}

function fixture(options: { maxBytes?: number; maxInventoryEntries?: number } = {}) {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-content-v2-synthetic-"));
  return {
    root,
    files: ContentFilesV2.open({ contentRoot: root, initialize: true, ...options }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("content v2 stages bounded bytes, publishes, and verifies reads after reopening", () => {
  const { root, files, cleanup } = fixture();
  try {
    const descriptor = files.stage(KEY, BODY);
    assert.deepEqual(descriptor, {
      ...KEY,
      byteCount: BODY.length,
      digest: createHash("sha256").update(BODY).digest("hex"),
    });
    assert.equal(readdirSync(join(root, "staging")).length, 1);
    assert.deepEqual(readdirSync(join(root, "objects")), []);
    assert.throws(() => files.read(descriptor), code("unavailable"));

    files.publish(descriptor);
    assert.deepEqual(readdirSync(join(root, "staging")), []);
    assert.equal(readdirSync(join(root, "objects")).length, 1);
    assert.deepEqual(files.read(descriptor), BODY);
    const reopened = ContentFilesV2.open({ contentRoot: root });
    assert.deepEqual(reopened.read(descriptor), BODY);
    assert.deepEqual(reopened.inventory([KEY]).map(({ identity: _identity, ...entry }) => entry), [
      { ...KEY, location: "objects", state: "reserved" },
    ]);
  } finally {
    cleanup();
  }
});

test("content v2 empty content and the exact size limit are supported", () => {
  const { files, cleanup } = fixture({ maxBytes: 3 });
  try {
    const empty = files.stage(KEY, Buffer.alloc(0));
    files.publish(empty);
    assert.equal(files.read(empty).length, 0);
    const exact = files.stage(OTHER_KEY, Buffer.from([1, 2, 3]));
    files.publish(exact);
    assert.deepEqual(files.read(exact), Buffer.from([1, 2, 3]));
  } finally {
    cleanup();
  }
});

test("content v2 takes an independent input copy and never overwrites a stage or object", () => {
  const { files, cleanup } = fixture();
  try {
    const input = Buffer.from(BODY);
    const descriptor = files.stage(KEY, input);
    input.fill(0);
    assert.throws(() => files.stage(KEY, Buffer.from("different synthetic text")), code("conflict"));
    files.publish(descriptor);
    assert.deepEqual(files.read(descriptor), BODY);
    assert.throws(() => files.stage(KEY, BODY), code("conflict"));
    assert.throws(() => files.publish(descriptor), code("conflict"));
    assert.deepEqual(files.read(descriptor), BODY);
  } finally {
    cleanup();
  }
});

test("content v2 refuses invalid content IDs, reservation IDs, and versions before creating files", () => {
  const { files, cleanup } = fixture();
  try {
    const invalidKeys: ContentFileKeyV2[] = [
      { ...KEY, contentId: "../synthetic" },
      { ...KEY, contentId: "00000000-0000-0000-0000-000000000000" },
      { ...KEY, reservationId: "synthetic/child" },
      { ...KEY, reservationId: "00000000-0000-4000-8000-00000000000A" },
      { ...KEY, version: 0 },
      { ...KEY, version: -1 },
      { ...KEY, version: 1.5 },
      { ...KEY, version: Number.MAX_SAFE_INTEGER + 1 },
      { ...KEY, version: Number.NaN },
    ];
    for (const invalid of invalidKeys) {
      assert.throws(() => files.stage(invalid, BODY), code("validation"));
      assert.throws(() => files.remove(invalid), code("validation"));
    }
    assert.throws(() => files.stage(KEY, "synthetic" as unknown as Uint8Array), code("validation"));
    assert.deepEqual(files.inventory([]), []);
  } finally {
    cleanup();
  }
});

test("content v2 rejects oversized writes without creating staging files", () => {
  const { files, cleanup } = fixture({ maxBytes: 3 });
  try {
    assert.throws(() => files.stage(KEY, Buffer.from([1, 2, 3, 4])), code("limit"));
    assert.deepEqual(files.inventory([]), []);
  } finally {
    cleanup();
  }
});

test("content v2 validates descriptor size and digest both before publish and before read", () => {
  const { files, cleanup } = fixture();
  try {
    const descriptor = files.stage(KEY, BODY);
    const wrongDigest = { ...descriptor, digest: "0".repeat(64) };
    const wrongSize = { ...descriptor, byteCount: descriptor.byteCount + 1 };
    assert.throws(() => files.publish(wrongDigest), code("corruption"));
    assert.throws(() => files.publish(wrongSize), code("corruption"));
    assert.throws(() => files.read(descriptor), code("unavailable"));
    files.publish(descriptor);
    assert.throws(() => files.read(wrongDigest), code("corruption"));
    assert.throws(() => files.read(wrongSize), code("corruption"));
    assert.throws(() => files.read({ ...descriptor, digest: "raw synthetic error text" }), code("validation"));
    assert.throws(() => files.read({ ...descriptor, byteCount: -1 }), code("validation"));
    assert.deepEqual(files.read(descriptor), BODY);
  } finally {
    cleanup();
  }
});

test("content v2 inventory only classifies full reserved identities and never publishes or reads", () => {
  const { files, cleanup } = fixture();
  try {
    const first = files.stage(KEY, BODY);
    const second = files.stage(OTHER_KEY, Buffer.from("Another fictional fixture."));
    files.publish(second);
    const inventory = files.inventory([KEY]);
    assert.deepEqual(inventory.map(({ identity: _identity, ...entry }) => entry), [
      { ...OTHER_KEY, location: "objects", state: "orphan" },
      { ...KEY, location: "staging", state: "reserved" },
    ]);
    for (const entry of inventory) {
      assert.match(entry.identity.device, /^\d+$/);
      assert.match(entry.identity.inode, /^\d+$/);
      assert.equal("digest" in entry, false);
      assert.equal("path" in entry, false);
    }
    assert.throws(() => files.read(first), code("unavailable"));
    assert.throws(() => files.inventory([KEY, KEY]), code("validation"));
    assert.throws(() => files.inventory([{ ...KEY, contentId: OTHER_KEY.contentId }]), code("corruption"));
  } finally {
    cleanup();
  }
});

test("content v2 inventory has an explicit bounded entry budget", () => {
  const { root, files, cleanup } = fixture();
  try {
    files.stage(KEY, BODY);
    files.stage(OTHER_KEY, BODY);
    const bounded = ContentFilesV2.open({ contentRoot: root, maxInventoryEntries: 1 });
    assert.throws(() => bounded.inventory([]), code("limit"));
    assert.throws(() => bounded.inventory([KEY, OTHER_KEY]), code("limit"));
  } finally {
    cleanup();
  }
});

test("content v2 removal reports each copy independently and supports durable retries", () => {
  const { files, cleanup } = fixture();
  try {
    const descriptor = files.stage(KEY, BODY);
    const [entry] = files.inventory([KEY]);
    assert.deepEqual(files.remove(KEY, { staging: { ...entry.identity, inode: "0" } }), {
      staging: { state: "failed", code: "conflict" },
      objects: { state: "absent" },
    });
    assert.equal(files.inventory([KEY]).length, 1);
    assert.deepEqual(files.remove(KEY, { staging: entry.identity }), {
      staging: { state: "removed" },
      objects: { state: "absent" },
    });
    assert.deepEqual(files.remove(KEY), {
      staging: { state: "absent" },
      objects: { state: "absent" },
    });
    assert.throws(() => files.read(descriptor), code("unavailable"));

    const published = files.stage(OTHER_KEY, BODY);
    files.publish(published);
    const [object] = files.inventory([OTHER_KEY]);
    assert.deepEqual(files.remove(OTHER_KEY, { objects: object.identity }), {
      staging: { state: "absent" },
      objects: { state: "removed" },
    });
    assert.deepEqual(files.inventory([]), []);
  } finally {
    cleanup();
  }
});

test("content v2 inventory cleanup removes only its scanned copy with a matching identity", () => {
  const { files, cleanup } = fixture();
  try {
    const staged = files.stage(KEY, BODY);
    const published = files.stage(OTHER_KEY, BODY);
    files.publish(published);
    const entries = files.inventory([OTHER_KEY]);
    const orphan = entries.find((entry) => entry.state === "orphan");
    assert.ok(orphan);
    assert.deepEqual(files.removeInventoryEntry({
      ...orphan,
      identity: { ...orphan.identity, byteCount: orphan.identity.byteCount + 1 },
    }), { state: "failed", code: "conflict" });
    assert.deepEqual(files.removeInventoryEntry(orphan), { state: "removed" });
    assert.deepEqual(files.removeInventoryEntry(orphan), { state: "absent" });
    assert.throws(() => files.publish(staged), code("unavailable"));
    assert.deepEqual(files.read(published), BODY);
  } finally {
    cleanup();
  }
});

test("content v2 stage descriptors do not copy unrelated caller fields", () => {
  const { files, cleanup } = fixture();
  try {
    const descriptor = files.stage({ ...KEY, extra: "fictional caller text" } as ContentFileKeyV2, BODY);
    assert.deepEqual(Object.keys(descriptor).sort(), ["byteCount", "contentId", "digest", "reservationId", "version"]);
  } finally {
    cleanup();
  }
});

test("content v2 open has explicit roots and resource limits with sanitized failures", () => {
  const { root, cleanup } = fixture();
  try {
    assert.throws(() => ContentFilesV2.open({ contentRoot: "relative-synthetic" }), code("validation"));
    assert.throws(() => ContentFilesV2.open({ contentRoot: join(root, "missing-synthetic") }), code("unavailable"));
    for (const maxBytes of [0, -1, 1.5, Number.NaN, 20 * 1024 * 1024 + 1]) {
      assert.throws(() => ContentFilesV2.open({ contentRoot: root, maxBytes }), code("validation"));
    }
    for (const maxInventoryEntries of [0, -1, 1.5, 100_001]) {
      assert.throws(() => ContentFilesV2.open({ contentRoot: root, maxInventoryEntries }), code("validation"));
    }
  } finally {
    cleanup();
  }
});

test("content v2 initialization requires explicit authority and reopen does not create missing directories", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-content-v2-init-synthetic-"));
  try {
    assert.throws(() => ContentFilesV2.open({ contentRoot: root }), code("unavailable"));
    assert.deepEqual(readdirSync(root), []);
    const files = ContentFilesV2.open({ contentRoot: root, initialize: true });
    assert.deepEqual(files.inventory([]), []);
    assert.throws(() => ContentFilesV2.open({ contentRoot: root, initialize: true }), code("conflict"));
    assert.deepEqual(ContentFilesV2.open({ contentRoot: root }).inventory([]), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
