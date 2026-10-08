import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { loadCatalog, validateCatalog, verifyEvidence, validateEvidenceProcess, root } from "./catalog-check.mjs";
import { checkRenderedCatalog } from "./render-catalog.mjs";
import { runSyntheticComposition, syntheticDeclaration, syntheticInput, validateDeclaration } from "./composition.mjs";

const catalog = loadCatalog();

test("real catalog uses one public owner per invariant and matches its generated documentation", () => {
  assert.equal(validateCatalog(catalog).size, 13);
  checkRenderedCatalog(catalog);
});
test("all catalog evidence names execute exactly once without skips or TODOs", () => {
  const evidence = verifyEvidence(catalog);
  assert.ok(evidence.files > 0 && evidence.passed > 0);
  console.log(`Exact catalog evidence: ${evidence.passed} tests in ${evidence.files} files`);
});

const catalogMutations = [
  ["duplicate invariant ID", (value) => value.invariants.push(structuredClone(value.invariants[0])), /Duplicate invariant ID/],
  ["missing owner field", (value) => delete value.invariants[0].owners, /Missing required field/],
  ["empty owner list", (value) => value.invariants[0].owners = [], /exactly one owner/],
  ["multiple owner packages", (value) => value.invariants[0].owners.push("memory-store"), /exactly one owner/],
  ["duplicate same owner", (value) => value.invariants[0].owners.push("protocol"), /exactly one owner/],
  ["nonexistent package", (value) => value.invariants[0].owners = ["future-provider"], /unknown owner package/],
  ["existing package with wrong public entry", (value) => value.invariants[0].owners = ["domain"], /missing public export/],
  ["nonexistent public export", (value) => value.invariants[0].entries[0].export = "absentExport", /missing public export/],
  ["internal protocol function not exported", (value) => value.invariants[0].entries[0].export = "assertNonEmpty", /missing public export/],
  ["nonexistent instance method", (value) => value.invariants[3].entries[0].method = "missingAppend", /missing own public method/],
  ["inherited method is not a declared entry", (value) => value.invariants[3].entries[0].method = "toString", /missing own public method/],
  ["duplicate entry with reordered keys", (value) => { const entry = value.invariants[3].entries[0]; value.invariants[3].entries.push({ method: entry.method, export: entry.export }); }, /Duplicate entry reference/],
  ["missing entry", (value) => value.invariants[0].entries = [], /nonempty array/],
  ["missing test file", (value) => value.invariants[0].tests[0].file = "packages/protocol/src/absent.test.ts", /ENOENT/],
  ["test path traversal", (value) => value.invariants[0].tests[0].file = "../outside.test.ts", /Invalid test path/],
  ["missing negative test reference", (value) => value.invariants[0].tests = [value.invariants[0].tests[0]], /positive and negative/],
  ["unknown catalog control", (value) => value.skipValidation = true, /Unknown field/],
];
for (const [name, mutate, error] of catalogMutations) {
  test(`catalog rejects ${name}`, () => {
    const candidate = structuredClone(catalog);
    mutate(candidate);
    assert.throws(() => validateCatalog(candidate), error);
  });
}
test("existing test file with a nonexistent exact test name is rejected by actual execution", () => {
  const candidate = structuredClone(catalog);
  candidate.invariants = [candidate.invariants.find((item) => item.id === "I-CORRECTION")];
  candidate.invariants[0].tests[0].name = "a plausible but absent test name";
  assert.throws(() => verifyEvidence(candidate), /actual test count differs/);
});
test("a substring of a real test name is not accepted as evidence", () => {
  const candidate = structuredClone(catalog);
  candidate.invariants = [candidate.invariants.find((item) => item.id === "I-CORRECTION")];
  candidate.invariants[0].tests[0].name = "explicit correction";
  assert.throws(() => verifyEvidence(candidate), /actual test count differs/);
});
test("catalog changes cannot silently leave the generated documentation stale", () => {
  const candidate = structuredClone(catalog);
  candidate.invariants[0].summary += " changed";
  assert.throws(() => checkRenderedCatalog(candidate), /mapping drift/);
});

const declarationMutations = [
  ["duplicate provider ID", (value) => value.providers.push(structuredClone(value.providers[0])), /Duplicate provider ID/],
  ["duplicate capability in one provider", (value) => value.providers[0].capabilities.push("pi-event-input-v1"), /Duplicate capability ID/],
  ["duplicate capability across providers", (value) => value.providers.push({ ...structuredClone(value.providers[0]), id: "second-provider" }), /Duplicate capability ID/],
  ["disabled core validation", (value) => value.providers[0].coreValidation = "disabled", /cannot disable/],
  ["false core validation", (value) => value.providers[0].coreValidation = false, /cannot disable/],
  ["missing core declaration", (value) => delete value.providers[0].coreValidation, /Missing required field/],
  ["skipValidation switch", (value) => value.providers[0].skipValidation = true, /Unknown field/],
  ["replacement validator", (value) => value.providers[0].validator = () => true, /Unknown field/],
  ["migration override", (value) => value.providers[0].migrations = [], /Unknown field/],
  ["global unsafe switch", (value) => value.unsafe = true, /Unknown field/],
  ["unknown provider", (value) => value.providers[0].id = "dynamic-provider", /fixed synthetic provider/],
  ["unknown capability", (value) => value.providers[0].capabilities = ["dynamic-capability"], /fixed synthetic capability/],
];
for (const [name, mutate, error] of declarationMutations) {
  test(`fixed composition rejects ${name} before reading input or opening SQLite`, () => {
    const directory = mkdtempSync(join(tmpdir(), "zhiwei-g1-reject-"));
    const filePath = join(directory, "must-not-exist.sqlite");
    const declaration = syntheticDeclaration();
    mutate(declaration);
    let inputRead = false;
    const inputs = { map() { inputRead = true; throw new Error("Input must not be read"); } };
    try {
      assert.throws(() => runSyntheticComposition({ catalog, declaration, inputs, filePath }), error);
      assert.equal(inputRead, false);
      assert.equal(existsSync(filePath), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
test("valid static declaration composes existing Adapter and file Ledger with exact replay", () => {
  const directory = mkdtempSync(join(tmpdir(), "zhiwei-g1-positive-"));
  const filePath = join(directory, "synthetic.sqlite");
  const options = { catalog, declaration: syntheticDeclaration(), inputs: [syntheticInput()], filePath };
  try {
    validateDeclaration(options.declaration);
    const first = runSyntheticComposition(options);
    const replay = runSyntheticComposition(options);
    assert.equal(first.result.insertedCount, 1);
    assert.equal(replay.result.insertedCount, 0);
    assert.equal(replay.result.replayedCount, 1);
    assert.deepEqual(replay.rows, first.rows);
    assert.equal(replay.rows.length, 1);
    assert.equal(first.journalMode, "wal");
    assert.deepEqual(replay.integrity, ["ok"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("a valid declaration does not make malformed provider data pass the existing core", () => {
  const directory = mkdtempSync(join(tmpdir(), "zhiwei-g1-invalid-input-"));
  const filePath = join(directory, "must-not-exist.sqlite");
  const input = syntheticInput();
  input.sourceSequence = 0;
  try {
    assert.throws(() => runSyntheticComposition({ catalog, declaration: syntheticDeclaration(), inputs: [input], filePath }), { name: "TypeError", message: "sequence.value must be a positive safe integer" });
    assert.equal(existsSync(filePath), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("evidence subprocess launch failure, nonzero exit and timeout fail closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "zhiwei-g1-spawn-"));
  try {
    const launch = spawnSync(join(directory, "missing-executable"), [], { encoding: "utf8" });
    assert.equal(launch.error?.code, "ENOENT");
    assert.throws(() => validateEvidenceProcess(launch, "synthetic process", new Set(["required"])), /ENOENT/);
    const exited = spawnSync(process.execPath, ["--eval", "process.exit(7)"], { encoding: "utf8" });
    assert.equal(exited.status, 7);
    assert.throws(() => validateEvidenceProcess(exited, "synthetic process", new Set(["required"])), /evidence subprocess failed/);
    const timedOut = spawnSync(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], { encoding: "utf8", timeout: 100 });
    assert.equal(timedOut.error?.code, "ETIMEDOUT");
    assert.throws(() => validateEvidenceProcess(timedOut, "synthetic process", new Set(["required"])), /ETIMEDOUT/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
for (const [name, records, error] of [
  ["skipped", [{ type: "test:pass", name: "required", skip: true, todo: false }], /skipped evidence/],
  ["TODO", [{ type: "test:pass", name: "required", skip: false, todo: true }], /TODO evidence/],
  ["duplicate", Array(2).fill({ type: "test:pass", name: "required", skip: false, todo: false }), /missing\/duplicate/],
  ["failed", [{ type: "test:fail", name: "required", skip: false, todo: false }], /failed evidence/],
]) {
  test(`evidence result parser rejects ${name} reporter records even with exit zero`, () => {
    const file = resolve(root, "synthetic reporter");
    const summary = { type: "test:summary", file, success: true,
      counts: { tests: 1, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0 } };
    const emitted = [...records.map((record) => ({ ...record, file, line: 2, column: 1, testType: "test" })), summary];
    const result = { status: 0, stdout: emitted.map((record) => JSON.stringify(record)).join("\n"), stderr: "" };
    assert.throws(() => validateEvidenceProcess(result, "synthetic reporter", new Set(["required"])), error);
  });
}

test("real Node file-wrapper pass cannot stand in for a test when the pattern matches zero tests", () => {
  const candidate = structuredClone(catalog);
  candidate.invariants = [candidate.invariants.find((item) => item.id === "I-CORRECTION")];
  for (const reference of candidate.invariants[0].tests) reference.name = resolve(root, reference.file);
  // On Node 22 the child summary has tests=0, followed by a wrapper pass named
  // after the absolute file. The global summary incorrectly looks like tests=1.
  assert.throws(() => verifyEvidence(candidate), /actual test count differs/);
});

function withReporterFixture(makeSource, inspect) {
  const directory = mkdtempSync(join(tmpdir(), "zhiwei-g1-reporter-"));
  const file = join(directory, "fixture.test.mjs");
  try {
    writeFileSync(file, makeSource(file));
    const result = spawnSync(process.execPath, ["--test", "--test-reporter",
      resolve(root, "docs/spikes/invariant-ownership/evidence-reporter.mjs"), file],
    { encoding: "utf8", timeout: 10_000,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")) });
    inspect(result, file);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("a real named test may legitimately use its absolute file path as its name", () => {
  withReporterFixture((file) => `import test from "node:test";\ntest(${JSON.stringify(file)}, () => {});\n`, (result, file) => {
    assert.equal(validateEvidenceProcess(result, file, new Set([file])), 1);
  });
});
test("a real Node suite pass is not a concrete named test even with one passing child", () => {
  withReporterFixture(() => 'import { describe, it } from "node:test";\ndescribe("suite-only", () => { it("child", () => {}); });\n', (result, file) => {
    assert.throws(() => validateEvidenceProcess(result, file, new Set(["suite-only"])), /evidence is not a concrete test/);
  });
});
test("an empty real Node suite cannot stand in for an executed named test", () => {
  withReporterFixture(() => 'import { describe } from "node:test";\ndescribe("empty-suite", () => {});\n', (result, file) => {
    assert.throws(() => validateEvidenceProcess(result, file, new Set(["empty-suite"])), /actual test count differs/);
  });
});
