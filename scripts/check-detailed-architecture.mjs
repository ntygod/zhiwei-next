import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const catalog = JSON.parse(read("docs/architecture/architecture-catalog.json"));
const plan = JSON.parse(read("docs/planning/development-plan.json"));
const tasks = new Set(plan.tasks.map((task) => task.id));
const scenes = new Set(plan.scenarios.map((scene) => scene.id));
const phases = new Set(plan.phases.map((phase) => phase.id));
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label}: duplicate identity`);
const pathValid = (path) => typeof path === "string" && /^(?:docs|apps|packages)\/[A-Za-z0-9_./-]+$/.test(path) && !path.split("/").some((part) => ["", ".", ".."].includes(part));
const ids = (items) => items.map((item) => item.id);
const expectedLayers = {
  domain: [], protocol: ["domain"], "cognition-core": ["domain"],
  "context-compiler": ["domain"], "memory-store": ["domain", "protocol"],
  "pi-adapter": ["domain", "protocol"],
  daemon: ["domain", "protocol", "cognition-core", "context-compiler", "memory-store", "pi-adapter"],
  web: ["protocol"], desktop: ["protocol"], cli: ["protocol"],
};

function refs(values, allowed, label) {
  assert.ok(Array.isArray(values) && values.length > 0, `${label}: empty`);
  unique(values, label);
  assert.ok(values.every((value) => allowed.has(value)), `${label}: unknown reference`);
}

function validate(data) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.kind, "detailed-architecture-design");
  assert.equal(data.status, "design-only", "Architecture catalog is not runtime completion evidence");
  assert.match(data.baselineHead, /^[a-f0-9]{40}$/);
  assert.ok(pathValid(data.decision) && existsSync(resolve(root, data.decision)));
  for (const name of ["documents", "components", "ports", "transactions", "packageLayers", "boundaryCases"]) {
    assert.ok(Array.isArray(data[name]) && data[name].length > 0, `${name}: empty`);
    unique(ids(data[name]), name);
  }
  const documents = new Set(ids(data.documents));
  const components = new Set(ids(data.components));
  const transactions = new Set(ids(data.transactions));
  for (const doc of data.documents) {
    assert.ok(pathValid(doc.path) && doc.path.startsWith("docs/architecture/") && existsSync(resolve(root, doc.path)), `Missing/unsafe document ${doc.id}`);
  }
  for (const component of data.components) {
    assert.match(component.id, /^C\d{2}$/);
    assert.ok(nonempty(component.name) && pathValid(component.path));
    assert.ok(phases.has(component.phase) && documents.has(component.document));
    refs(component.tasks, tasks, component.id);
    refs(component.scenarios, scenes, component.id);
  }
  for (const port of data.ports) {
    assert.ok(nonempty(port.id) && pathValid(port.definition) && pathValid(port.providerPath));
    refs(port.consumers, components, port.id);
    if (port.definition.startsWith("apps/")) {
      assert.ok(port.consumers.every((id) => data.components.find((component) => component.id === id).path.startsWith("apps/")), `${port.id}: package must not depend on application-owned contract`);
    }
    assert.ok(Array.isArray(port.operations) && port.operations.length > 0 && port.operations.every(nonempty));
    unique(port.operations, port.id);
  }
  for (const transaction of data.transactions) {
    assert.match(transaction.id, /^T\d{2}$/);
    assert.ok(nonempty(transaction.name) && components.has(transaction.owner));
    assert.equal(transaction.store, "C15", "Persistent writes have one coordination boundary");
    refs(transaction.tasks, tasks, transaction.id);
    refs(transaction.scenarios, scenes, transaction.id);
  }
  assert.deepEqual(ids(data.packageLayers).sort(), Object.keys(expectedLayers).sort());
  for (const layer of data.packageLayers) assert.deepEqual(layer.depends, expectedLayers[layer.id], `Illegal package dependency at ${layer.id}`);
  const graph = new Map(data.packageLayers.map((layer) => [layer.id, layer.depends]));
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    assert.ok(!visiting.has(id), `Package import cycle at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id); for (const child of graph.get(id)) visit(child);
    visiting.delete(id); visited.add(id);
  }
  for (const id of graph.keys()) visit(id);
  for (const item of data.boundaryCases) {
    assert.ok(nonempty(item.case) && nonempty(item.expected));
    refs(item.transactions, transactions, item.id);
    refs(item.scenarios, scenes, item.id);
  }
  const overview = read("docs/architecture/detailed-design.md");
  const persistence = read("docs/architecture/persistence-and-recovery.md");
  for (const item of data.components) assert.ok(overview.includes(`| ${item.id} ${item.name} |`), `Component prose drift: ${item.id}`);
  for (const port of data.ports) assert.ok(overview.includes(`| ${port.id} /`), `Port prose drift: ${port.id}`);
  for (const tx of data.transactions) assert.ok(persistence.includes(`| ${tx.id} ${tx.name} |`), `Transaction prose drift: ${tx.id}`);
}

validate(catalog);
for (const mutate of [
  (data) => { data.components[1].id = data.components[0].id; },
  (data) => { data.components[0].tasks = ["P9-99"]; },
  (data) => { data.ports[0].consumers = ["C99"]; },
  (data) => { data.transactions[0].owner = "C99"; },
  (data) => { data.transactions[0].store = "C02"; },
  (data) => { data.packageLayers.find((item) => item.id === "cognition-core").depends.push("pi-adapter"); },
  (data) => { data.packageLayers.find((item) => item.id === "domain").depends.push("protocol"); },
  (data) => { data.documents[0].path = "../../outside"; },
  (data) => { data.boundaryCases[0].scenarios = ["Z99"]; },
  (data) => { data.status = "implemented"; },
  (data) => { data.ports.find((port) => port.id === "BackupCodecPort").consumers = ["C15"]; },
]) {
  const changed = structuredClone(catalog); mutate(changed);
  assert.throws(() => validate(changed), "Malformed architecture catalog accepted");
}

let relativeLinks = 0;
for (const doc of [...catalog.documents, {path: catalog.decision}]) {
  const text = read(doc.path);
  assert.equal((text.match(/^```/gm) ?? []).length % 2, 0, `Unclosed code fence: ${doc.path}`);
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    relativeLinks++;
    assert.ok(existsSync(resolve(dirname(resolve(root, doc.path)), target)), `Missing link in ${doc.path}: ${target}`);
  }
}

// Validate only the documented structural example, in an isolated in-memory DB.
// This is not a production migration, WAL/recovery proof or domain implementation.
const sqlBlocks = [...read("docs/architecture/persistence-and-recovery.md").matchAll(/```sql\r?\n([\s\S]*?)```/g)];
assert.equal(sqlBlocks.length, 1);
const db = new DatabaseSync(":memory:");
try {
  db.exec("PRAGMA foreign_keys=ON");
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  db.exec(sqlBlocks[0][1]);
  db.prepare("INSERT INTO session_v2_example VALUES (?, ?, ?)").run("session-a", "workspace-a", 1);
  db.prepare("INSERT INTO task_v2_example VALUES (?, ?, ?, ?, ?)").run("task-a", "workspace-a", "session-a", 1, 1);
  db.prepare("INSERT INTO attempt_v2_example VALUES (?, ?, ?, ?)").run("attempt-a", "task-a", 1, 1);
  assert.throws(() => db.prepare("INSERT INTO task_v2_example VALUES (?, ?, ?, ?, ?)").run("task-b", "workspace-b", "session-a", 1, 1), /FOREIGN KEY/);
  assert.throws(() => db.prepare("INSERT INTO attempt_v2_example VALUES (?, ?, ?, ?)").run("attempt-b", "task-a", 2, 1), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO attempt_v2_example VALUES (?, ?, ?, ?)").run("attempt-c", "task-a", 1, 0), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO attempt_v2_example VALUES (?, ?, ?, ?)").run("attempt-d", "task-a", 2, 2), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO session_v2_example VALUES (?, ?, ?)").run("session-b", "workspace-b", "bad-revision"), /INTEGER/);
  db.exec("BEGIN IMMEDIATE; UPDATE task_v2_example SET revision=2 WHERE id='task-a'; ROLLBACK;");
  assert.equal(db.prepare("SELECT revision FROM task_v2_example WHERE id='task-a'").get().revision, 1);
  const tables = db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get().n;
  assert.equal(tables, 3);
} finally { db.close(); }
console.log(`Detailed architecture: ${catalog.components.length} components, ${catalog.ports.length} ports, ${catalog.transactions.length} transactions, ${catalog.boundaryCases.length} boundary mappings, ${relativeLinks} relative links; 11 catalog negative checks and isolated SQL example constraints OK. Product implementation NOT verified.`);
