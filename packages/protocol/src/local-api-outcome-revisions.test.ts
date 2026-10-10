import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CognitiveProtocolError, deserializeLocalApiReceiptV1, parseLocalApiReceiptV1, serializeLocalApiReceiptV1 } from "./index.ts";

// Generated using the unchanged public deriveOutcome API; no protocol -> cognition-core dependency.
const golden = readFileSync(new URL("../fixtures/local-api-v1-outcome-revisions.json", import.meta.url), "utf8").trim();
const fixtures = (): Record<string, any>[] => JSON.parse(golden);

test("revised Outcomes preserve initial terminal history and expose current result classification", () => {
  const inputs = fixtures();
  assert.deepEqual(inputs.map(input => [input.result.taskState, input.result.outcome.status]), [
    ["COMPLETED", "failed"], ["COMPLETED", "partial"], ["COMPLETED", "unverifiable"], ["FAILED", "completed"],
  ]);
  assert.equal(`[${inputs.map(serializeLocalApiReceiptV1).join(",")}]`, golden);
  for (const input of inputs) {
    const before = JSON.stringify(input);
    const parsed = deserializeLocalApiReceiptV1(serializeLocalApiReceiptV1(input));
    assert.deepEqual(parsed, input); assert.equal(JSON.stringify(input), before);
    assert.equal(parsed.result.kind === "task" && parsed.result.initialOutcome?.ref.revision, 1);
    assert.equal(parsed.result.kind === "task" && parsed.result.outcome?.ref.revision, 2);
  }
});

test("revised Outcome references cannot replace the initial result or switch identities/cancellation", () => {
  for (const mutate of [
    (v: any) => { delete v.result.initialOutcome; },
    (v: any) => { delete v.result.outcome; },
    (v: any) => { v.result.initialOutcome.ref.id = "other-outcome"; },
    (v: any) => { v.result.initialOutcome.ref.revision = 2; },
    (v: any) => { v.result.initialOutcome.status = "failed"; },
    (v: any) => { v.result.initialOutcome.authorized = true; },
    (v: any) => { v.result.outcome.ref.revision = 1; },
    (v: any) => { v.result.outcome.status = "unknown"; },
    (v: any) => { v.result.outcome.status = "cancelled"; },
    (v: any) => { v.result.taskState = "VERIFYING"; },
  ]) {
    const input = fixtures()[0]; mutate(input);
    assert.throws(() => parseLocalApiReceiptV1(input), CognitiveProtocolError);
  }
});

test("later cancellation Outcomes remain cancelled without changing direct-stop absence semantics", () => {
  const input = fixtures()[0];
  input.result.taskState = "CANCELLED";
  input.result.initialOutcome.status = "cancelled"; input.result.outcome.status = "cancelled";
  assert.deepEqual(parseLocalApiReceiptV1(input), input);
  input.result.outcome.status = "completed";
  assert.throws(() => parseLocalApiReceiptV1(input), CognitiveProtocolError);
  delete input.result.outcome; delete input.result.initialOutcome;
  assert.deepEqual(parseLocalApiReceiptV1(input), input);
});
