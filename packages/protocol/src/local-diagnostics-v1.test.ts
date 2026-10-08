import assert from "node:assert/strict";
import test from "node:test";
import { isDiagnosticToken, parseDiagnosticHealthV1 } from "./index.ts";

test("health parsing returns only the finite diagnostic DTO without invoking accessors", () => {
  const health = { status: "ok", service: "zhiwei-daemon", version: "0.0.0", milestone: "M0-bootstrap" };
  const parsed = parseDiagnosticHealthV1(health);
  assert.deepEqual(parsed, health);
  assert.notEqual(parsed, health);
  let getterCalls = 0;
  const accessor = { ...health, get status() { getterCalls++; return "ok"; } };
  for (const value of [undefined, null, [], "ok", { ...health, secret: "synthetic" },
    { ...health, version: "future" }, Object.assign(Object.create({}), health),
    { ...health, [Symbol("extra")]: "synthetic" }, accessor,
    Object.defineProperty({ ...health }, "status", { value: "ok", enumerable: false }),
  ]) assert.equal(parseDiagnosticHealthV1(value), undefined);
  assert.equal(getterCalls, 0);
});

test("diagnostic credential syntax is fixed ASCII and does not imply entropy", () => {
  assert.equal(isDiagnosticToken("a".repeat(64)), true);
  assert.equal(isDiagnosticToken("A".repeat(64)), true);
  for (const token of [undefined, null, "", "a".repeat(63), "a".repeat(65), "g".repeat(64), "é".repeat(64), `${"a".repeat(64)}\n`]) {
    assert.equal(isDiagnosticToken(token), false);
  }
});
