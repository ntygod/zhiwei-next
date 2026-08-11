import assert from "node:assert/strict";
import test from "node:test";

import { correctClaim } from "./index.ts";
import { ids, type MemoryClaim } from "../../domain/src/index.ts";

const oldClaim: MemoryClaim = {
  id: ids.claim("claim-java-22"),
  kind: "constraint",
  statement: "项目统一使用 Java 22",
  scope: { kind: "workspace", workspaceId: ids.workspace("zhiwei-next") },
  evidenceIds: [ids.observation("obs-1")],
  confidence: 1,
  status: "active",
  validFrom: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

test("explicit correction supersedes the old claim and activates a new version", () => {
  const result = correctClaim(oldClaim, {
    id: ids.claim("claim-java-23"),
    statement: "新模块开始使用 Java 23",
    evidenceIds: [ids.observation("obs-2")],
    confidence: 1,
    now: "2026-08-11T00:00:00.000Z",
  });

  assert.equal(result.previous.status, "superseded");
  assert.equal(result.previous.validTo, "2026-08-11T00:00:00.000Z");
  assert.equal(result.current.status, "active");
  assert.equal(result.current.supersedesId, oldClaim.id);
  assert.equal(result.current.scope, oldClaim.scope);
});

test("a correction without evidence is rejected", () => {
  assert.throws(
    () => correctClaim(oldClaim, {
      id: ids.claim("claim-invalid"),
      statement: "无证据的新结论",
      evidenceIds: [],
      confidence: 1,
      now: "2026-08-11T00:00:00.000Z",
    }),
    /at least one evidence/,
  );
});
