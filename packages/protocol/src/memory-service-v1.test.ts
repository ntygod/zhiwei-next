import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJsonV1, deserializeLocalApiMemoryInputV1, deserializeLocalApiMemoryExplanationRequestV1,
  deserializeLocalApiMemorySearchV1, deserializeLocalApiCommandV1 } from "./index.ts";
test("Additive memory v1 input/dispute/history fixtures preserve canonical wire data", () => {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/memory-service-v1.json", import.meta.url), "utf8")) as Record<string, unknown>;
  const parsers = { input: deserializeLocalApiMemoryInputV1, dispute: deserializeLocalApiCommandV1, search: deserializeLocalApiMemorySearchV1, explanation: deserializeLocalApiMemoryExplanationRequestV1 };
  for (const [kind, parse] of Object.entries(parsers)) assert.equal(canonicalJsonV1(parse(canonicalJsonV1(fixture[kind]))), canonicalJsonV1(fixture[kind]));
});
