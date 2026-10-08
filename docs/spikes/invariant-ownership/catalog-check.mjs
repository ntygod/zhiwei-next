// Opt-in decision experiment. No product process imports this module.
import assert from "node:assert/strict";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as domain from "../../../packages/domain/src/index.ts";
import * as cognition from "../../../packages/cognition-core/src/index.ts";
import * as context from "../../../packages/context-compiler/src/index.ts";
import * as protocol from "../../../packages/protocol/src/index.ts";
import * as adapter from "../../../packages/pi-adapter/src/index.ts";
import * as store from "../../../packages/memory-store/src/index.ts";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const publicModules = { domain, "cognition-core": cognition, "context-compiler": context,
  protocol, "pi-adapter": adapter, "memory-store": store };

export function exactKeys(value, required, optional = []) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Expected plain object");
  assert.equal(Object.getPrototypeOf(value), Object.prototype, "Expected plain object");
  assert.ok(required.every((key) => Object.hasOwn(value, key)), "Missing required field");
  assert.ok(Object.keys(value).every((key) => [...required, ...optional].includes(key)), "Unknown field");
}
function text(value, label) {
  assert.ok(typeof value === "string" && value.length > 0 && value === value.trim(), `${label}: nonempty string required`);
}
function list(value, label) {
  assert.ok(Array.isArray(value) && value.length > 0, `${label}: nonempty array required`);
}
function repositoryFile(path) {
  assert.ok(typeof path === "string" && /^packages\/[a-z-]+\/src\/[a-z0-9-]+\.test\.ts$/.test(path), "Invalid test path");
  const absolute = resolve(root, path);
  const canonical = realpathSync(absolute);
  assert.equal(canonical, absolute, "Test reference must not traverse a symlink");
  assert.ok(!relative(root, canonical).startsWith(`..${sep}`), "Test outside repository");
  assert.ok(statSync(canonical).isFile(), "Test reference is not a file");
}
export function loadCatalog() {
  return JSON.parse(readFileSync(new URL("catalog.json", import.meta.url), "utf8"));
}

// Checks only declarations, real public exports and existing test files.
// Test names/behavior are established by verifyEvidence, not a text search.
export function validateCatalog(catalog) {
  exactKeys(catalog, ["schemaVersion", "invariants"]);
  assert.equal(catalog.schemaVersion, 1, "Unknown experiment catalog version");
  list(catalog.invariants, "invariants");
  const ids = new Set();
  for (const invariant of catalog.invariants) {
    exactKeys(invariant, ["id", "owners", "maturity", "summary", "entries", "tests", "limitations"]);
    assert.match(invariant.id, /^I-[A-Z]+(?:-[A-Z]+)*$/, "Invalid invariant ID");
    assert.ok(!ids.has(invariant.id), `Duplicate invariant ID: ${invariant.id}`);
    ids.add(invariant.id);
    assert.ok(Array.isArray(invariant.owners) && invariant.owners.length === 1, `${invariant.id}: exactly one owner required`);
    const owner = invariant.owners[0];
    assert.ok(typeof owner === "string" && Object.hasOwn(publicModules, owner), `${invariant.id}: unknown owner package`);
    assert.ok(statSync(resolve(root, `packages/${owner}/src/index.ts`)).isFile());
    assert.ok(["formal-v1", "bootstrap-sentinel"].includes(invariant.maturity), "Invalid maturity");
    text(invariant.summary, "summary");
    text(invariant.limitations, "limitations");
    list(invariant.entries, "entries");
    const entries = new Set();
    for (const entry of invariant.entries) {
      exactKeys(entry, ["export"], ["method"]);
      assert.match(entry.export, /^[A-Za-z][A-Za-z0-9]*$/, "Invalid export name");
      const module = publicModules[owner];
      assert.ok(Object.hasOwn(module, entry.export), `${owner}: missing public export ${entry.export}`);
      const exported = module[entry.export];
      assert.equal(typeof exported, "function", `${owner}.${entry.export}: not callable`);
      if (Object.hasOwn(entry, "method")) {
        assert.match(entry.method, /^[a-z][A-Za-z0-9]*$/, "Invalid method name");
        assert.notEqual(entry.method, "constructor", "Constructor is not an instance method");
        const descriptor = Object.getOwnPropertyDescriptor(exported.prototype ?? {}, entry.method);
        assert.equal(typeof descriptor?.value, "function", `${owner}.${entry.export}: missing own public method ${entry.method}`);
      }
      const key = JSON.stringify([entry.export, entry.method ?? null]);
      assert.ok(!entries.has(key), "Duplicate entry reference");
      entries.add(key);
    }
    list(invariant.tests, "tests");
    const roles = new Set();
    for (const evidence of invariant.tests) {
      exactKeys(evidence, ["file", "name", "role"]);
      repositoryFile(evidence.file);
      text(evidence.name, "test name");
      assert.ok(["positive", "negative", "positive-and-negative"].includes(evidence.role), "Invalid evidence role");
      roles.add(evidence.role);
    }
    assert.ok(roles.has("positive-and-negative") || (roles.has("positive") && roles.has("negative")), `${invariant.id}: positive and negative references required`);
  }
  return ids;
}

// Run existing tests using their real node:test names. No source-regex evidence,
// imported test callbacks, reimplemented assertions or claimed passing skips.
export function verifyEvidence(catalog) {
  validateCatalog(catalog);
  const groups = new Map();
  for (const invariant of catalog.invariants) {
    for (const evidence of invariant.tests) {
      if (!groups.has(evidence.file)) groups.set(evidence.file, new Set());
      groups.get(evidence.file).add(evidence.name);
    }
  }
  let passed = 0;
  for (const [file, names] of groups) {
    const escaped = [...names].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test",
      "--test-reporter", resolve(root, "docs/spikes/invariant-ownership/evidence-reporter.mjs"),
      "--test-name-pattern", `^(?:${escaped.join("|")})$`, resolve(root, file)],
    { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")) });
    passed += validateEvidenceProcess(result, file, names);
  }
  return { files: groups.size, passed };
}

// Fail closed for process failures before inspecting otherwise plausible records.
export function validateEvidenceProcess(result, file, names) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${file}: evidence subprocess failed\n${result.stderr}\n${result.stdout}`);
  const results = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const expectedFile = resolve(root, file);
  // The global summary counts a file wrapper as a passing test when no test
  // matched. Only the child file's own summary counts actual named tests.
  const summaries = results.filter((entry) => entry.type === "test:summary" && entry.file === expectedFile);
  assert.equal(summaries.length, 1, `${file}: missing/duplicate file summary`);
  const summary = summaries[0];
  assert.equal(summary.success, true, `${file}: unsuccessful file summary`);
  assert.equal(summary.counts?.tests, names.size, `${file}: actual test count differs from requested names`);
  assert.equal(summary.counts?.passed, names.size, `${file}: actual passing test count differs from requested names`);
  for (const key of ["failed", "cancelled", "skipped", "todo"]) {
    assert.equal(summary.counts?.[key], 0, `${file}: file summary has ${key} tests`);
  }
  for (const name of names) {
    const matches = results.filter((entry) => ["test:pass", "test:fail"].includes(entry.type) && entry.name === name);
    assert.equal(matches.length, 1, `${file}: missing/duplicate executed test ${name}`);
    assert.equal(matches[0].testType, "test", `${file}: evidence is not a concrete test: ${name}`);
    assert.equal(matches[0].file, expectedFile, `${file}: evidence comes from a different file: ${name}`);
    assert.ok(Number.isInteger(matches[0].line) && matches[0].line > 0 &&
      Number.isInteger(matches[0].column) && matches[0].column > 0, `${file}: missing test source location: ${name}`);
    assert.equal(matches[0].type, "test:pass", `${file}: failed evidence ${name}`);
    assert.equal(matches[0].skip, false, `${file}: skipped evidence ${name}`);
    assert.equal(matches[0].todo, false, `${file}: TODO evidence ${name}`);
  }
  return names.size;
}
