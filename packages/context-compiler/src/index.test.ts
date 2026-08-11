import assert from "node:assert/strict";
import test from "node:test";

import { compileContext } from "./index.ts";
import { ids, type MemoryClaim } from "../../domain/src/index.ts";

function claim(id: string, workspace: string, statement: string): MemoryClaim {
  return {
    id: ids.claim(id),
    kind: "constraint",
    statement,
    scope: { kind: "workspace", workspaceId: ids.workspace(workspace) },
    evidenceIds: [ids.observation(`evidence-${id}`)],
    confidence: 1,
    status: "active",
    validFrom: "2026-08-11T00:00:00.000Z",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

test("workspace compilation never leaks a claim from another workspace", () => {
  const capsule = compileContext(
    [
      claim("claim-a", "workspace-a", "A 项目使用 Rust"),
      claim("claim-b", "workspace-b", "B 项目使用 Java"),
    ],
    {
      sessionId: ids.session("session-a"),
      workspaceId: ids.workspace("workspace-a"),
      maxClaims: 10,
      compiledAt: "2026-08-11T12:00:00.000Z",
    },
  );

  assert.deepEqual(capsule.entries.map((entry) => entry.statement), ["A 项目使用 Rust"]);
});
