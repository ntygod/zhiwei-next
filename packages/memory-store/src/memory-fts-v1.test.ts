import assert from "node:assert/strict";
import test from "node:test";
import { rankMemoryTextsV1 } from "./memory-fts-v1.ts";

const material = [
  { id: "memory-b", version: 2, statement: "工作坊预算上限为8万元" },
  { id: "memory-a", version: 1, statement: "研究项目的预算为3万元" },
];
test("FTS5 ranks qualified Chinese material and rebuilding uses only the new input", () => {
  const first = rankMemoryTextsV1(material, "预算上限", 50);
  assert.equal(first.method, "fts5-trigram"); assert.deepEqual(first.rows.map(row => row.id), ["memory-b"]);
  assert.deepEqual(rankMemoryTextsV1([material[1]!], "预算上限", 50).rows, []);
});
test("short Chinese queries use an explicit scoped scan with stable order", () => {
  const result = rankMemoryTextsV1(material, "预算", 50);
  assert.equal(result.method, "scoped-short-query"); assert.deepEqual(result.rows.map(row => row.id), ["memory-a", "memory-b"]);
});
test("quote and FTS operator characters remain literal search text", () => {
  const result = rankMemoryTextsV1([{ id: "memory-q", version: 1, statement: 'literal "OR" marker' }], '"OR"', 50);
  assert.deepEqual(result.rows.map(row => row.id), ["memory-q"]);
  assert.deepEqual(rankMemoryTextsV1(material, '" OR *', 50).rows, []);
});
