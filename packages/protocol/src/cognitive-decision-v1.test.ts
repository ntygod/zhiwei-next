import assert from "node:assert/strict";
import test from "node:test";
import type { CognitiveDecisionV1 } from "../../domain/src/index.ts";
import { parseCognitiveDecisionV1, serializeCognitiveDecisionV1, deserializeCognitiveDecisionV1 } from "./cognitive-decision-v1.ts";
const basis = { schemaVersion: 1 as const, summary: "SYNTHETIC_ONLY：依据当前任务和材料", claimRefs: [{ kind: "claim" as const, id: "synthetic-claim", revision: 2, version: 2 }] };
test("six bounded proposals survive canonical serialization without authority or model reasoning", () => {
  const proposals: readonly CognitiveDecisionV1[] = [{ ...basis, action: "respond", text: "SYNTHETIC_ONLY：报告待核对" }, { ...basis, action: "clarify", question: { id: "synthetic-question", prompt: "SYNTHETIC_ONLY：采用哪种颜色？" } },
    { ...basis, action: "retrieve", query: "虚构灯塔颜色" }, { ...basis, action: "execute", plan: "SYNTHETIC_ONLY：准备虚构报告" }, { ...basis, action: "wait", condition: { kind: "user-input", id: "synthetic-input", description: "SYNTHETIC_ONLY：等待确认颜色" } }, { ...basis, action: "stop", reason: "no-progress" }];
  for (const proposal of proposals) assert.deepEqual(deserializeCognitiveDecisionV1(serializeCognitiveDecisionV1(proposal)), proposal);
});
test("bad JSON, unknown versions/actions/fields, forged grants and duplicate references are rejected", () => {
  const decision = { ...basis, action: "respond", text: "SYNTHETIC_ONLY" };
  for (const value of [{ ...decision, schemaVersion: 2 }, { ...decision, action: "complete" }, { ...decision, thinking: "unretained" }, { ...decision, grant: true }, { ...decision, text: "x".repeat(4097) }, { ...decision, claimRefs: [...basis.claimRefs, ...basis.claimRefs] }]) assert.throws(() => parseCognitiveDecisionV1(value));
  assert.throws(() => deserializeCognitiveDecisionV1('{"schemaVersion":1'));
  assert.throws(() => deserializeCognitiveDecisionV1('{"schemaVersion":1,"schemaVersion":1}'));
  let invoked = false; const value = { ...decision }; Object.defineProperty(value, "summary", { enumerable: true, get() { invoked = true; return "getter"; } });
  assert.throws(() => parseCognitiveDecisionV1(value)); assert.equal(invoked, false);
});
