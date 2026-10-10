import assert from "node:assert/strict";
import test from "node:test";

import {
  selectContextBudget,
  type BudgetSelectionInput,
} from "./budget-selection.ts";

type Material = BudgetSelectionInput["materials"][number];
type Counter = BudgetSelectionInput["counter"];

// These deliberately synthetic exact counters prove component behavior only.
// They do not model a tokenizer or claim real provider token accuracy.
const zeroCounter: Counter = { id: "synthetic-zero", version: "1", mode: "exact", count: () => 0 };
const lengthCounter: Counter = { id: "synthetic-utf16", version: "1", mode: "exact", count: (text) => text.length };

function material(id: string, overrides: Partial<Material> = {}): Material {
  return {
    id, version: 1,
    sourceRefs: [{ id: `source-${id}`, version: 1, selector: "whole" }],
    body: `PAYLOAD_${id}_END`, category: "current", required: false, priorityOrdinal: 0,
    ...overrides,
  };
}

function input(materials: readonly Material[] = [], memoryBudget = 100, counter: Counter = zeroCounter): BudgetSelectionInput {
  return {
    base: { constraints: "", currentRequest: "", acceptanceCriteria: "", workingState: "" },
    materials,
    budget: { contextLimit: memoryBudget * 4, reservedOutput: 0, mandatoryProtocolOverhead: 0 },
    counter,
  };
}

function successful(value: BudgetSelectionInput) {
  const result = selectContextBudget(value);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error("Expected successful budget selection");
  return result;
}

function synthetic(costs: Readonly<Record<string, number>>, baseCost = 0): Counter {
  return {
    id: "synthetic-payload-cost", version: "1", mode: "exact",
    count(text) {
      let cost = text.includes("Task contract") ? baseCost : 0;
      for (const [id, amount] of Object.entries(costs)) {
        if (text.includes(`PAYLOAD_${id}_END`)) cost += amount;
      }
      return cost;
    },
  };
}

function invalid(value: unknown) {
  const result = selectContextBudget(value as BudgetSelectionInput);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected input rejection");
  return result;
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]));
}

function assertDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertDeepFrozen(child);
  }
}

test("structural input validation precedes counting and budget conflicts", () => {
  let calls = 0;
  const counter: Counter = { ...zeroCounter, count: () => { calls++; throw new Error("private payload"); } };
  const valid = input([material("a")], 0, counter);
  const cases: unknown[] = [null, undefined, {}, { ...valid, base: {} }, { ...valid, materials: null }, { ...valid, counter: undefined }];
  for (const key of ["constraints", "currentRequest", "acceptanceCriteria", "workingState"]) {
    const base = { ...valid.base } as Record<string, unknown>;
    delete base[key];
    cases.push({ ...valid, base }, { ...valid, base: { ...valid.base, [key]: 123 } });
  }
  for (const key of ["contextLimit", "reservedOutput", "mandatoryProtocolOverhead"]) {
    for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "5", undefined]) {
      cases.push({ ...valid, budget: { ...valid.budget, [key]: value } });
    }
  }
  for (const change of [
    { id: "" }, { id: 1 }, { version: 0 }, { version: 0.5 }, { version: Number.MAX_SAFE_INTEGER + 1 },
    { sourceRefs: [] }, { sourceRefs: [{ id: "s", version: 1 }] },
    { sourceRefs: [{ id: "", version: 1, selector: "whole" }] },
    { sourceRefs: [{ id: "s", version: 0, selector: "whole" }] },
    { sourceRefs: [{ id: "s", version: 1, selector: "" }] },
    { body: null }, { category: "unknown" }, { required: 1 }, { priorityOrdinal: -1 },
    { priorityOrdinal: NaN }, { priorityOrdinal: Number.MAX_SAFE_INTEGER + 1 },
  ]) cases.push({ ...valid, materials: [{ ...material("a"), ...change }] });
  for (const change of [{ id: "" }, { version: "" }, { mode: "estimate" }, { count: null }]) {
    cases.push({ ...valid, counter: { ...counter, ...change } });
  }
  for (const candidate of cases) assert.equal(invalid(candidate).error, "invalid_input");
  assert.equal(calls, 0);
});

test("invalid duplicate identities fail before the counter is called", () => {
  const original = material("same");
  const changes: Partial<Material>[] = [
    { body: "different" }, { category: "open" }, { required: true }, { priorityOrdinal: 1 },
    { sourceRefs: [{ id: "other", version: 1, selector: "whole" }] },
    { sourceRefs: [{ id: "source-same", version: 2, selector: "whole" }] },
    { sourceRefs: [{ id: "source-same", version: 1, selector: "part" }] },
    { conflictGroupId: "g", conflictMembers: [{ id: "same", version: 1 }] },
  ];
  const counter: Counter = { ...zeroCounter, count: () => { throw new Error("must not count malformed input"); } };
  for (const change of changes) {
    for (const candidates of permutations([original, { ...original, ...change }])) {
      assert.equal(invalid(input(candidates, 100, counter)).error, "invalid_input");
    }
  }
});

test("counter exceptions and invalid counts produce only a fixed error", () => {
  for (const count of [
    () => { throw new Error("SECRET_PAYLOAD_DO_NOT_LEAK"); },
    () => -1, () => 0.5, () => NaN, () => Infinity, () => Number.MAX_SAFE_INTEGER + 1,
    () => "3" as unknown as number,
  ]) {
    const result = invalid(input([], 100, { ...zeroCounter, count }));
    assert.equal(result.error, "token_count_error");
    assert.equal(JSON.stringify(result).includes("SECRET_PAYLOAD_DO_NOT_LEAK"), false);
    assertDeepFrozen(result);
  }
});

test("nonzero empty-text counts are token_count_error", () => {
  const result = invalid(input([], 100, { ...zeroCounter, count: (text) => text === "" ? 1 : 0 }));
  assert.equal(result.error, "token_count_error");
});

test("budget subtraction rejects negative availability and unsafe intermediate arithmetic", () => {
  const value = input();
  assert.equal(invalid({ ...value, budget: { contextLimit: 1, reservedOutput: 2, mandatoryProtocolOverhead: 0 } }).error, "budget_conflict");
  assert.equal(invalid({ ...value, budget: { contextLimit: 0, reservedOutput: Number.MAX_SAFE_INTEGER, mandatoryProtocolOverhead: Number.MAX_SAFE_INTEGER } }).error, "invalid_input");
});

function group(id: string, members: readonly Material[]): Material[] {
  const refs = members.map(({ id, version }) => ({ id, version }));
  return members.map((member) => ({ ...member, conflictGroupId: id, conflictMembers: refs }));
}

test("conflict groups reject missing, inconsistent, cross-category, and dangling members", () => {
  const [a, b] = group("g", [material("a"), material("b")]);
  const invalidGroups: readonly Material[][] = [
    [a],
    [a, { ...b, category: "open" }],
    [a, { ...b, conflictGroupId: "other" }],
    [a, { ...b, conflictMembers: [{ id: "b", version: 1 }] }],
    [{ ...a, conflictMembers: [{ id: "a", version: 1 }, { id: "b", version: 2 }] }, b],
    [{ ...material("a"), conflictGroupId: "g" }],
    [{ ...material("a"), conflictMembers: [{ id: "a", version: 1 }] }],
    [{ ...material("a"), conflictGroupId: "", conflictMembers: [{ id: "a", version: 1 }] }],
  ];
  for (const candidates of invalidGroups) {
    for (const arrangement of permutations(candidates)) assert.equal(invalid(input(arrangement)).error, "invalid_input");
  }
});

test("selection does not mutate deeply frozen inputs or the injected counter object", () => {
  const candidates = group("g", [material("a", { required: true }), material("b")]);
  const value = input(candidates, 100, synthetic({ a: 1, b: 1 }));
  const before = JSON.stringify(value);
  function freeze(value: unknown): void {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  freeze(value);
  const result = successful(value);
  assert.equal(JSON.stringify(value), before);
  assertDeepFrozen(result);
});

function selectedIds(result: ReturnType<typeof successful>): string[] {
  return result.selectedUnits.flatMap((unit) => unit.members.map((member) => `${member.id}@${member.version}`));
}

function reason(result: ReturnType<typeof successful>, id: string) {
  const decision = result.decisions.find((decision) => decision.refs.some((ref) => ref.id === id));
  assert.ok(decision, `Missing decision for ${id}`);
  return decision.reason;
}

test("zero budget and empty candidates yield an exact base-only result", () => {
  const result = successful(input([], 0));
  assert.equal(result.rendering.memoryText, "");
  assert.equal(result.rendering.fullText, result.rendering.baseText);
  assert.deepEqual(result.selectedUnits, []);
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.accounting.finalExactTokens, { memory: 0, full: 0 });
  assert.equal(result.accounting.memoryBudget, 0);
});

test("memory budget independently applies quarter, remaining-input, and 4096 caps", () => {
  for (const [available, baseCost, expected] of [[400, 0, 100], [400, 390, 10], [40000, 0, 4096], [Number.MAX_SAFE_INTEGER, 0, 4096]]) {
    const value = input([], 0, synthetic({}, baseCost));
    const result = successful({ ...value, budget: { contextLimit: available, reservedOutput: 0, mandatoryProtocolOverhead: 0 } });
    assert.equal(result.accounting.memoryBudget, expected);
    assert.equal(result.accounting.availableInput, available);
  }
  const value = input([], 0, synthetic({}, 300));
  const result = successful({ ...value, budget: { contextLimit: 450, reservedOutput: 100, mandatoryProtocolOverhead: 50 } });
  assert.equal(result.accounting.availableInput, 300);
  assert.equal(result.accounting.memoryBudget, 0);
  assert.equal(invalid({ ...value, budget: { contextLimit: 299, reservedOutput: 0, mandatoryProtocolOverhead: 0 } }).error, "budget_conflict");
});

test("largest-remainder 60/25/15 allocation is exact for every bounded budget", () => {
  for (let budget = 0; budget <= 4096; budget++) {
    const numerators = [60n, 25n, 15n].map((weight) => BigInt(budget) * weight);
    const expected = numerators.map((value) => Number(value / 100n));
    const order = [0, 1, 2].sort((a, b) => Number(numerators[b] % 100n - numerators[a] % 100n) || a - b);
    const remainder = budget - expected.reduce((sum, value) => sum + value, 0);
    for (const index of order.slice(0, remainder)) expected[index]++;
    const result = successful(input([], budget));
    assert.deepEqual(Object.values(result.accounting.initialQuotas), expected, `budget ${budget}`);
  }
  assert.deepEqual(successful(input([], 3)).accounting.initialQuotas, { current: 2, experience: 1, open: 0 });
});

test("required costs consume quotas and transfer from open before experience", () => {
  const result = successful(input([
    material("c", { required: true }), material("e", { required: true, category: "experience" }),
    material("o", { required: true, category: "open" }),
  ], 100, synthetic({ c: 80, e: 10, o: 5 })));
  assert.deepEqual(result.accounting.initialQuotas, { current: 60, experience: 25, open: 15 });
  assert.deepEqual(result.accounting.requiredQuotas, { current: 80, experience: 15, open: 5 });
  assert.deepEqual(result.accounting.transfers, [{ from: "open", to: "current", tokens: 10 }, { from: "experience", to: "current", tokens: 10 }]);
  assert.equal(result.accounting.initialSelectedCost, 95);
  assert.deepEqual(result.decisions.map((decision) => decision.reason), ["required", "required", "required"]);
});

test("required boundary succeeds exactly and fails one token over", () => {
  assert.equal(successful(input([material("a", { required: true })], 100, synthetic({ a: 100 }))).accounting.initialSelectedCost, 100);
  assert.equal(invalid(input([material("a", { required: true })], 100, synthetic({ a: 101 }))).error, "budget_conflict");
  const counter: Counter = { ...zeroCounter, count: (text) => text.includes("PAYLOAD") ? Number.MAX_SAFE_INTEGER : 0 };
  assert.equal(invalid(input([material("a", { required: true }), material("b", { required: true })], 100, counter)).error, "invalid_input");
});

test("empty categories lend once; category exclusion becomes one final borrow decision", () => {
  const result = successful(input([material("a")], 100, synthetic({ a: 90 })));
  assert.deepEqual(selectedIds(result), ["a@1"]);
  assert.equal(reason(result, "a"), "selected_by_borrow");
  assert.equal(result.decisions.length, 1);
  assert.deepEqual(result.phaseTrace.map(({ phase, status, reason }) => ({ phase, status, reason })), [
    { phase: "category", status: "excluded", reason: "category_budget" },
    { phase: "borrow", status: "selected", reason: "selected_by_borrow" },
  ]);
  assert.deepEqual(result.accounting.borrowAllocations, [{ refs: [{ id: "a", version: 1 }], category: "current", ownTokens: 60, borrowedTokens: 30 }]);
  assert.deepEqual(result.accounting.borrowedQuotas, { current: 90, experience: 0, open: 0 });
});

test("nonempty categories do not donate unused quotas even when no candidate fits", () => {
  const result = successful(input([material("a"), material("b", { category: "experience" }), material("c", { category: "open" })], 100, synthetic({ a: 61, b: 26, c: 16 })));
  assert.deepEqual(selectedIds(result), []);
  assert.deepEqual(result.decisions.map((decision) => decision.reason), ["category_budget", "category_budget", "category_budget"]);
  assert.deepEqual(result.accounting.borrowAllocations, []);
});

test("scan skips oversized candidates and does not perform knapsack reordering", () => {
  const result = successful(input([
    material("large", { priorityOrdinal: 0 }), material("first", { priorityOrdinal: 1 }),
    material("second", { priorityOrdinal: 2 }), material("third", { priorityOrdinal: 3 }),
    material("e", { category: "experience" }), material("o", { category: "open" }),
  ], 100, synthetic({ large: 101, first: 40, second: 30, third: 20, e: 26, o: 16 })));
  assert.deepEqual(selectedIds(result), ["first@1", "third@1"]);
  assert.equal(reason(result, "large"), "memory_budget");
  assert.equal(reason(result, "second"), "category_budget");
});

test("borrow scan follows global priority, consumes own quota first, and skips large candidates", () => {
  const result = successful(input([
    material("a", { priorityOrdinal: 2 }), material("b", { category: "experience", priorityOrdinal: 1 }),
    material("large", { priorityOrdinal: 0 }),
  ], 100, synthetic({ a: 61, b: 30, large: 101 })));
  assert.deepEqual(selectedIds(result), ["a@1", "b@1"]);
  assert.deepEqual(result.accounting.borrowAllocations.map(({ refs, ownTokens, borrowedTokens }) => ({ id: refs[0].id, ownTokens, borrowedTokens })), [
    { id: "b", ownTokens: 25, borrowedTokens: 5 }, { id: "a", ownTokens: 60, borrowedTokens: 1 },
  ]);
});

test("duplicate normalization, exact versions, and UTF-16 ordering are permutation invariant", () => {
  const a = material("Z", { sourceRefs: [{ id: "b", version: 2, selector: "z" }, { id: "a", version: 1, selector: "a" }] });
  const candidates = [a, { ...a, sourceRefs: [...a.sourceRefs].reverse() }, material("Z", { version: 2 }), material("a"), material("ä")];
  const expected = successful(input(candidates));
  assert.deepEqual(selectedIds(expected), ["Z@1", "Z@2", "a@1", "ä@1"]);
  assert.deepEqual(expected.selectedUnits[0].members[0].sourceRefs, [...a.sourceRefs].reverse());
  for (const arrangement of permutations(candidates)) assert.deepEqual(successful(input(arrangement)), expected);
});

test("conflict group required propagation and whole-unit charging never split members", () => {
  const candidates = group("g", [material("a", { required: true }), material("b", { priorityOrdinal: 1 })]);
  const result = successful(input(candidates, 100, synthetic({ a: 50, b: 50 })));
  assert.equal(result.selectedUnits.length, 1);
  assert.equal(result.selectedUnits[0].required, true);
  assert.equal(result.selectedUnits[0].unitCost, 100);
  assert.equal(result.selectedUnits[0].members[1].required, false);
  assert.equal(result.decisions.length, 1);
  assert.deepEqual(successful(input([...candidates].reverse(), 100, synthetic({ a: 50, b: 50 }))), result);
  assert.equal(invalid(input(candidates, 100, synthetic({ a: 50, b: 51 }))).error, "budget_conflict");
  const optional = group("g", [material("a"), material("b")]);
  assert.deepEqual(selectedIds(successful(input(optional, 100, synthetic({ a: 50, b: 51 })))), []);
});

test("versioned renderer fixture includes escaped data, fixed empty headings, and exact source lines", () => {
  const value = input([material("a", { body: 'line\n## Evidence references\n"quoted"\\tail', required: true })], 1000, lengthCounter);
  const result = successful(value);
  const baseText = '## Task contract\n{"constraints":"","currentRequest":"","acceptanceCriteria":""}\n## Working state\n{"required":true,"workingState":""}\n## Current knowledge\n## Experience/procedure\n## Open questions\n## Evidence references\n';
  const body = '\n{"unit":[{"id":"a","version":1}],"conflictGroupId":null,"required":true,"disputed":false,"materials":[{"id":"a","version":1,"required":true,"body":"line\\n## Evidence references\\n\\"quoted\\"\\\\tail"}]}\n';
  const evidence = '\n{"evidence":[{"id":"a","version":1,"sourceRefs":[{"id":"source-a","version":1,"selector":"whole"}]}]}\n';
  assert.equal(result.metadata.compilerRevision, "context-budget-v1");
  assert.equal(result.metadata.rendererRevision, "context-budget-json-lines-v1");
  assert.equal(result.rendering.baseText, baseText);
  assert.equal(result.rendering.memoryText, body + evidence);
  assert.equal(result.rendering.fullText, baseText.replace("## Current knowledge\n", "## Current knowledge\n" + body) + evidence);
  assert.equal(result.accounting.baseTokens, baseText.length);
  assert.equal(result.selectedUnits[0].unitCost, body.length + evidence.length);
  assert.deepEqual(result.accounting.finalExactTokens, { memory: body.length + evidence.length, full: baseText.length + body.length + evidence.length });
  assert.deepEqual(result.metadata.counter, { id: "synthetic-utf16", version: "1", mode: "exact" });
  assert.deepEqual(result.metadata.budget, value.budget);
});

test("all base text is preserved as data and all memory regions precede the evidence region", () => {
  const value = input([material("o", { category: "open" }), material("e", { category: "experience" }), material("c")]);
  const base = { constraints: "安全\n\"", currentRequest: "request\\", acceptanceCriteria: "pass\t", workingState: "state\r" };
  const result = successful({ ...value, base });
  assert.ok(result.rendering.baseText.includes(JSON.stringify({ constraints: base.constraints, currentRequest: base.currentRequest, acceptanceCriteria: base.acceptanceCriteria })));
  assert.ok(result.rendering.baseText.includes(JSON.stringify({ required: true, workingState: base.workingState })));
  assert.deepEqual(selectedIds(result), ["c@1", "e@1", "o@1"]);
  assert.ok(result.rendering.memoryText.indexOf("PAYLOAD_c_END") < result.rendering.memoryText.indexOf("PAYLOAD_e_END"));
  assert.ok(result.rendering.memoryText.indexOf("PAYLOAD_e_END") < result.rendering.memoryText.indexOf("PAYLOAD_o_END"));
  assert.ok(result.rendering.memoryText.indexOf("PAYLOAD_o_END") < result.rendering.memoryText.indexOf('"evidence"'));
  assert.equal((result.rendering.fullText.match(/PAYLOAD_c_END/g) ?? []).length, 1);
  assert.ok(result.rendering.memoryText.includes('"disputed":true'));
});

test("source references, labels, and separators are charged rather than body-only", () => {
  const result = successful(input([material("a", { body: "", sourceRefs: [{ id: "source", version: 9, selector: "x".repeat(200) }] })], 1000, lengthCounter));
  assert.ok(result.selectedUnits[0].unitCost > 200);
  assert.equal(result.selectedUnits[0].unitCost, result.rendering.memoryText.length);
  assert.equal(result.accounting.finalExactTokens.full, result.rendering.fullText.length);
});

test("nonadditive final memory counting removes the lowest optional instead of trusting fragment totals", () => {
  const ordinary = synthetic({ a: 30, b: 30 });
  const counter: Counter = { ...ordinary, count(text) {
    const both = text.includes("PAYLOAD_a_END") && text.includes("PAYLOAD_b_END");
    return ordinary.count(text) + (both && !text.startsWith("## Task contract\n") ? 50 : 0);
  } };
  const result = successful(input([material("b"), material("a")], 100, counter));
  assert.deepEqual(selectedIds(result), ["a@1"]);
  assert.equal(reason(result, "b"), "final_budget");
  assert.equal(result.accounting.initialSelectedCost, 60);
  assert.equal(result.accounting.retainedInitialCost, 30);
  assert.equal(result.accounting.removedInitialCost, 30);
  assert.equal(result.accounting.finalExactTokens.memory, 30);
  assert.equal(result.decisions.length, 2);
});

test("whole-text final overflow is checked separately from memory and may reject required-only", () => {
  const ordinary = synthetic({ a: 20 });
  const counter: Counter = { ...ordinary, count(text) {
    return text.startsWith("## Task contract\n") && text.includes("PAYLOAD_a_END") ? 401 : ordinary.count(text);
  } };
  const optional = successful(input([material("a")], 100, counter));
  assert.deepEqual(selectedIds(optional), []);
  assert.equal(reason(optional, "a"), "final_budget");
  assert.equal(invalid(input([material("a", { required: true })], 100, counter)).error, "budget_conflict");
});

test("required memory fragments that are individually affordable can fail the final memory hard gate", () => {
  const ordinary = synthetic({ a: 30, b: 30 });
  const counter: Counter = { ...ordinary, count(text) {
    return !text.startsWith("## Task contract\n") && text.includes("PAYLOAD_a_END") && text.includes("PAYLOAD_b_END") ? 101 : ordinary.count(text);
  } };
  assert.equal(invalid(input([material("a", { required: true }), material("b", { required: true })], 100, counter)).error, "budget_conflict");
});

test("final trimming removes optional groups atomically using their highest-priority member", () => {
  const candidates = [material("best", { priorityOrdinal: 1 }), ...group("g", [material("a", { priorityOrdinal: 2 }), material("b", { priorityOrdinal: 99 })])];
  const ordinary = synthetic({ best: 20, a: 20, b: 20 });
  const counter: Counter = { ...ordinary, count(text) {
    return text.startsWith("## Task contract\n") && text.includes("PAYLOAD_best_END") && text.includes("PAYLOAD_a_END") ? 401 : ordinary.count(text);
  } };
  const result = successful(input(candidates, 100, counter));
  assert.deepEqual(selectedIds(result), ["best@1"]);
  assert.equal(result.decisions.length, 2);
  assert.deepEqual(result.decisions.find((decision) => decision.conflictGroupId === "g")?.refs, [{ id: "a", version: 1 }, { id: "b", version: 1 }]);
  assert.equal(reason(result, "a"), "final_budget");
  assert.equal(result.accounting.removedInitialCost, 40);
});

test("final removal retains borrowed accounting as history and never backfills a skipped candidate", () => {
  const ordinary = synthetic({ a: 60, b: 40, c: 1 });
  const counter: Counter = { ...ordinary, count(text) {
    return text.startsWith("## Task contract\n") && text.includes("PAYLOAD_b_END") ? 401 : ordinary.count(text);
  } };
  const result = successful(input([
    material("a"), material("b", { priorityOrdinal: 1 }), material("c", { priorityOrdinal: 2 }),
  ], 100, counter));
  assert.deepEqual(selectedIds(result), ["a@1"]);
  assert.equal(reason(result, "b"), "final_budget");
  assert.equal(reason(result, "c"), "memory_budget");
  assert.equal(result.accounting.initialSelectedCost, 100);
  assert.equal(result.accounting.retainedInitialCost, 60);
  assert.equal(result.accounting.removedInitialCost, 40);
  assert.deepEqual(result.accounting.borrowedQuotas, { current: 100, experience: 0, open: 0 });
  assert.deepEqual(result.accounting.borrowAllocations, [{ refs: [{ id: "b", version: 1 }], category: "current", ownTokens: 0, borrowedTokens: 40 }]);
  assert.deepEqual(result.phaseTrace.filter((step) => step.refs[0].id === "b").map((step) => [step.phase, step.reason]), [
    ["category", "category_budget"], ["borrow", "selected_by_borrow"], ["final", "final_budget"],
  ]);
  assert.equal(result.decisions.filter((decision) => decision.refs[0].id === "b").length, 1);
});

test("nonmonotonic counts terminate by removing units even when counts rise", () => {
  const observed: string[] = [];
  const counter: Counter = { ...zeroCounter, count(text) {
    observed.push(text);
    const n = ["a", "b", "c"].filter((id) => text.includes(`PAYLOAD_${id}_END`)).length;
    if (text.startsWith("## Task contract\n")) return n === 0 ? 0 : 500 + (3 - n) * 100;
    return n * 10;
  } };
  const result = successful(input([material("c"), material("b"), material("a")], 100, counter));
  assert.deepEqual(selectedIds(result), []);
  assert.deepEqual(result.phaseTrace.filter((step) => step.phase === "final").map((step) => step.refs[0].id), ["c", "b", "a"]);
  assert.equal(result.accounting.removedInitialCost, 30);
  assert.equal(new Set(observed.filter((text) => text.startsWith("## Task contract\n"))).size, 4);
});

test("repeated-text inconsistent counts fail and never return successful fragments", () => {
  const seen = new Map<string, number>();
  const counter: Counter = { ...zeroCounter, count(text) {
    const times = seen.get(text) ?? 0;
    seen.set(text, times + 1);
    return text === "" ? 0 : times;
  } };
  const result = invalid(input([], 100, counter));
  assert.equal(result.error, "token_count_error");
  assert.equal("rendering" in result, false);
  assert.equal("selectedUnits" in result, false);
});

test("result copies nested identities and budget; later input edits cannot change it", () => {
  const members = group("g", [material("a"), material("b")]);
  const value = input(members);
  const result = successful(value);
  const snapshot = JSON.stringify(result);
  assert.notEqual(result.selectedUnits[0].members[0], members[0]);
  assert.notEqual(result.selectedUnits[0].members[0].sourceRefs, members[0].sourceRefs);
  assert.notEqual(result.selectedUnits[0].members[0].conflictMembers, members[0].conflictMembers);
  assert.notEqual(result.metadata.budget, value.budget);
  (members[0].sourceRefs[0] as { selector: string }).selector = "changed";
  (members[0].conflictMembers![0] as { version: number }).version = 99;
  (value.budget as { contextLimit: number }).contextLimit = 0;
  (value.base as { constraints: string }).constraints = "changed";
  assert.equal(JSON.stringify(result), snapshot);
  assertDeepFrozen(result);
  assert.throws(() => { (result.selectedUnits[0].refs[0] as { id: string }).id = "changed"; }, TypeError);
  assert.equal(Object.isFrozen(value.counter), false);
});

test("required transfer allocation covers every small feasible cost triple without making optional required", () => {
  for (let budget = 0; budget <= 8; budget++) {
    for (let c = 0; c <= budget; c++) for (let e = 0; e <= budget - c; e++) for (let o = 0; o <= budget - c - e; o++) {
      const result = successful(input([
        material("c", { required: true }), material("e", { required: true, category: "experience" }),
        material("o", { required: true, category: "open" }), material("optional", { priorityOrdinal: 1 }),
      ], budget, synthetic({ c, e, o, optional: budget + 1 })));
      const quotas = result.accounting.requiredQuotas;
      assert.equal(quotas.current + quotas.experience + quotas.open, budget);
      assert.ok(quotas.current >= c && quotas.experience >= e && quotas.open >= o);
      assert.deepEqual(selectedIds(result), ["c@1", "e@1", "o@1"]);
      assert.equal(reason(result, "optional"), "memory_budget");
    }
  }
});

test("group priority uses the highest-priority member and required units are never removed", () => {
  const ordinary = synthetic({ a: 10, b: 10, c: 10, required: 10 });
  const counter: Counter = { ...ordinary, count(text) {
    return text.startsWith("## Task contract\n") && text.includes("PAYLOAD_c_END") ? 401 : ordinary.count(text);
  } };
  const result = successful(input([
    ...group("g", [material("a"), material("b", { priorityOrdinal: 99 })]),
    material("c", { priorityOrdinal: 1 }), material("required", { required: true, priorityOrdinal: 100 }),
  ], 100, counter));
  assert.deepEqual(selectedIds(result), ["a@1", "b@1", "required@1"]);
  assert.equal(reason(result, "c"), "final_budget");
  assert.equal(reason(result, "required"), "required");
});

test("counter errors are checked at base, standalone unit, final memory, and final full phases", () => {
  const predicates = [
    (text: string) => text.startsWith("## Task contract\n") && !text.includes("PAYLOAD"),
    (text: string) => !text.startsWith("## Task contract\n") && text.includes("PAYLOAD_a_END"),
    (text: string) => !text.startsWith("## Task contract\n") && text.includes("PAYLOAD_a_END") && text.includes("PAYLOAD_b_END"),
    (text: string) => text.startsWith("## Task contract\n") && text.includes("PAYLOAD_a_END"),
  ];
  for (const shouldFail of predicates) {
    let failed = false;
    const counter: Counter = { ...zeroCounter, count(text) {
      assert.equal(failed, false, "must stop after a count failure");
      if (shouldFail(text)) { failed = true; return NaN; }
      return 0;
    } };
    assert.equal(invalid(input([material("a"), material("b")], 100, counter)).error, "token_count_error");
    assert.equal(failed, true);
  }
});

test("base and required budget conflicts precede counting lower-stage material", () => {
  const counter: Counter = { ...zeroCounter, count(text) {
    if (text.includes("PAYLOAD_optional_END")) throw new Error("optional failure must not mask budget conflict");
    return text.includes("PAYLOAD_required_END") ? 101 : 0;
  } };
  assert.equal(invalid(input([material("required", { required: true }), material("optional")], 100, counter)).error, "budget_conflict");
  const baseCounter: Counter = { ...counter, count(text) {
    if (text.includes("PAYLOAD")) throw new Error("material failure must not mask base conflict");
    return text.startsWith("## Task contract\n") ? 401 : 0;
  } };
  assert.equal(invalid(input([material("required", { required: true })], 100, baseCounter)).error, "budget_conflict");
});

test("malformed-candidate permutations produce identical failure classifications and reasons", () => {
  const malformed = [
    { ...material("a"), body: null },
    { ...material("b"), sourceRefs: [] },
    { ...material("c"), conflictGroupId: "missing-members" },
  ];
  const expected = invalid({ ...input(), materials: malformed });
  assert.equal(expected.error, "invalid_input");
  for (const arrangement of permutations(malformed)) assert.deepEqual(invalid({ ...input(), materials: arrangement }), expected);
});

test("runtime extra nested properties are neither aliased nor frozen through returned metadata", () => {
  const value = input([material("a")]);
  const extra = { nested: { mutable: true } };
  const extended = {
    ...value,
    base: { ...value.base, extra },
    budget: { ...value.budget, extra },
    counter: { ...value.counter, extra },
    materials: value.materials.map((item) => ({ ...item, extra })),
  };
  const result = successful(extended);
  assert.equal(Object.isFrozen(extra), false);
  assert.equal(Object.isFrozen(extra.nested), false);
  assert.equal("extra" in result.metadata.budget, false);
  assert.equal("extra" in result.selectedUnits[0].members[0], false);
  assert.equal("extra" in result.metadata.counter, false);
  assert.equal(result.rendering.fullText.includes("mutable"), false);
  extra.nested.mutable = false;
  assertDeepFrozen(result);
});
