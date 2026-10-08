import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const planning = resolve(root, "docs/planning");
const read = (name) => readFileSync(resolve(planning, name), "utf8");
const catalog = JSON.parse(read("work-packages.json"));
const expectedCounts = { candidate: 60, required: 57, product: 51, engineering: 6, conditional: 3 };
const expectedIds = [
  ...[8, 7, 6, 5, 5, 7, 8, 5].flatMap((count, milestone) =>
    Array.from({ length: count }, (_, index) => `M${milestone}-${index + 1}`)),
  ...Array.from({ length: 6 }, (_, index) => `G-${index + 1}`),
  ...Array.from({ length: 3 }, (_, index) => `X-${index + 1}`),
];
const decisionIds = Array.from({ length: 11 }, (_, index) => `D-${String(index + 1).padStart(2, "0")}`);
const taskIds = (text) => text.match(/(?:M[0-7]|G|X)-\d+/g) ?? [];

function validateStructure(data) {
  assert.equal(data.schema_version, 1);
  assert.deepEqual(data.counts, expectedCounts);
  const cards = data.work_packages;
  assert.deepEqual(cards.map((card) => card.id).sort(), [...expectedIds].sort(), "Stable task IDs drifted");
  assert.equal(cards.filter((card) => card.required).length, 57);
  for (const kind of ["product", "engineering", "conditional"]) {
    assert.equal(cards.filter((card) => card.kind === kind).length, expectedCounts[kind]);
  }
  assert.deepEqual(Object.keys(data.decision_statuses).sort(), decisionIds);
  assert.ok(Object.values(data.decision_statuses).every((status) => status === "Proposed"),
    "A future accepted decision requires a reviewed schema/checker/document transition, not a silent status change");
  const graph = new Map();
  for (const card of cards) {
    const milestone = card.id.startsWith("M") ? card.id.split("-")[0] : null;
    const kind = milestone ? "product" : card.id.startsWith("G") ? "engineering" : "conditional";
    assert.equal(card.kind, kind);
    assert.equal(card.required, kind !== "conditional");
    assert.equal(card.milestone, milestone);
    const gate = milestone && milestone !== "M0" ? `M${Number(milestone.slice(1)) - 1}` : null;
    assert.equal(card.entry_milestone_gate, gate, `${card.id}: wrong entry gate`);
    assert.equal(new Set(card.depends_on).size, card.depends_on.length);
    assert.ok(card.depends_on.every((id) => expectedIds.includes(id)), `${card.id}: unknown dependency`);
    assert.ok(card.decisions.every((id) => decisionIds.includes(id)), `${card.id}: unknown decision`);
    assert.ok(["R2", "R3"].includes(card.risk));
    graph.set(card.id, [...card.depends_on, ...(gate ? [`gate:${gate}`] : [])]);
  }
  assert.deepEqual(Object.keys(data.milestone_gates).sort(), Array.from({ length: 8 }, (_, i) => `M${i}`));
  for (let i = 0; i < 8; i++) {
    const entry = data.milestone_gates[`M${i}`];
    const required = cards.filter((card) => card.milestone === `M${i}`).map((card) => card.id);
    if (i === 0) required.push(...Array.from({ length: 5 }, (_, j) => `G-${j + 1}`));
    assert.deepEqual([...entry.required_packages].sort(), required.sort(), `M${i}: incomplete exit gate`);
    assert.equal(entry.previous_gate, i ? `M${i - 1}` : null);
    assert.equal(entry.status, "unverified", "Planning snapshot is not a live completion database");
    graph.set(`gate:M${i}`, [...entry.required_packages, ...(i ? [`gate:M${i - 1}`] : [])]);
  }
  const seen = new Set();
  const active = new Set();
  function visit(id) {
    assert.ok(graph.has(id), `Unknown graph node ${id}`);
    assert.ok(!active.has(id), `Dependency cycle at ${id}`);
    if (seen.has(id)) return;
    active.add(id);
    for (const dependency of graph.get(id)) visit(dependency);
    active.delete(id);
    seen.add(id);
  }
  for (const id of graph.keys()) visit(id);
  assert.equal(seen.size, 68);
}
validateStructure(catalog);

// Mutation tests prove failures are rejected, without changing files or gates.
for (const mutate of [
  (data) => { data.work_packages[1].id = data.work_packages[0].id; },
  (data) => { data.work_packages[0].depends_on.push("M9-1"); },
  (data) => { data.work_packages[0].depends_on.push("M0-2"); },
  (data) => { data.work_packages.find((card) => card.id === "M1-1").entry_milestone_gate = null; },
  (data) => { data.milestone_gates.M0.required_packages.pop(); },
  (data) => { data.work_packages.find((card) => card.id === "X-1").required = true; },
  (data) => { data.decision_statuses["D-01"] = "Accepted"; },
]) {
  const changed = structuredClone(catalog);
  mutate(changed);
  assert.throws(() => validateStructure(changed), "Malformed catalog must fail closed");
}

const detailNames = ["milestone-m0-execution.md", "milestone-m1.md", "engineering-execution.md", "milestone-m2-m7-execution.md"];
const parsed = new Map();
const field = (body, name) => body.match(new RegExp(`\\*\\*${name}：\\*\\*(.*)`))?.[1].trim();
function bullets(body, start, end) {
  const section = body.match(new RegExp(`${start}\\n([\\s\\S]*?)(?=${end})`))?.[1];
  assert.ok(section, `Missing ${start}`);
  return section.split("\n").filter((line) => line.startsWith("- ")).map((line) => line.replace(/^- (?:\[ \] )?/, ""));
}
for (const filename of detailNames) {
  for (const match of read(filename).matchAll(/^## ((?:M[0-7]|G|X)-\d+) · (.+)\n([\s\S]*?)(?=^## |^# |$(?![\s\S]))/gm)) {
    const [, id, title, body] = match;
    assert.ok(!parsed.has(id), `Duplicate detail card ${id}`);
    parsed.set(id, { filename, title, body });
  }
}
assert.equal(parsed.size, 60);
for (const card of catalog.work_packages) {
  const detail = parsed.get(card.id);
  assert.ok(detail, `Missing card ${card.id}`);
  assert.equal(card.source_document, detail.filename);
  assert.equal(card.title, detail.title);
  const pre = detail.body.match(/\*\*前置：\*\*(.*?)\*\*规划风险：\*\*(R\d)/);
  assert.ok(pre, `${card.id}: missing dependency/risk`);
  assert.deepEqual(card.depends_on, taskIds(pre[1]));
  assert.equal(card.risk, pre[2]);
  for (const [key, label] of Object.entries({ outcome: "交付结果", decision_requirement: "前置决策", expected_paths: "预计触及", non_goals: "明确不做", evidence_and_rollback: "证据与回滚", execution_and_review: "执行与审查", planning_basis: "规划依据" })) {
    assert.equal(card[key], field(detail.body, label), `${card.id}: ${key} differs from card`);
    assert.ok(card[key]);
  }
  assert.deepEqual(card.decisions, card.decision_requirement.match(/D-\d+/g) ?? []);
  assert.deepEqual(card.completion_conditions, bullets(detail.body, "### 完成条件", "### 必须覆盖"));
  assert.deepEqual(card.failure_paths, bullets(detail.body, "### 必须覆盖的失败路径", "\\*\\*明确不做"));
  assert.ok(Number.isInteger(card.source_start_line) && card.source_start_line > 0);
  assert.ok(card.source_end_line >= card.source_start_line && card.source_end_line <= 2327);
}

const overview = read("execution-plan.md");
const rows = [...overview.matchAll(/^\| ((?:M[0-7]|G|X)-\d+) \| (.*?) \| (.*?) \| (R\d) \|$/gm)];
assert.equal(rows.length, 60);
for (const row of rows) {
  const card = catalog.work_packages.find((entry) => entry.id === row[1]);
  assert.deepEqual(card.depends_on, taskIds(row[3]), `${card.id}: overview dependency drift`);
  assert.equal(card.risk, row[4]);
}
const decisions = [...read("decision-register.md").matchAll(/^## (D-\d+) · [^\n]+\n\n状态：\*\*([^*]+)\*\*/gm)];
assert.deepEqual(decisions.map((match) => match[1]).sort(), decisionIds);
assert.ok(decisions.every((match) => match[2] === "Proposed"));
const scenarioText = read("milestone-m0-execution.md") + read("milestone-m1.md");
const scenarios = [...scenarioText.matchAll(/^\| (E[01]-\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
assert.equal(scenarios.length, 24);
assert.equal(new Set(scenarios.map((match) => match[1])).size, 24);
for (const scenario of scenarios) {
  // A row can mix M0-4/5/8 and M0-1/G-5: explicit prefixes reset the group.
  let prefix = null;
  for (const token of scenario[4].trim().split(/\s*[/,，]\s*/)) {
    const explicit = token.match(/^(M[0-7]|G|X)-(\d+)$/);
    if (explicit) prefix = explicit[1];
    const number = explicit?.[2] ?? token;
    assert.ok(prefix && /^\d+$/.test(number), `Invalid scenario owner ${token}`);
    assert.ok(expectedIds.includes(`${prefix}-${number}`), `Unknown scenario owner ${token}`);
  }
}
const sceneMap = read("scenario-id-map.md");
const aliases = [...sceneMap.matchAll(/^\| (S[01]-\d+) \|/gm)].map((match) => match[1]);
const expectedAliases = [0, 1].flatMap((i) => Array.from({ length: 12 }, (_, j) => `S${i}-${String(j + 1).padStart(2, "0")}`));
assert.deepEqual(aliases.sort(), expectedAliases);
for (const scenario of scenarios) assert.ok(sceneMap.includes(scenario[1]), `Unmapped scenario ${scenario[1]}`);
for (const filename of [...detailNames, "execution-plan.md", "decision-register.md", "next-task-handoff.md", "scenario-id-map.md", "plan-source-and-validation.md"]) {
  for (const match of read(filename).matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    assert.ok(existsSync(resolve(planning, target)), `${filename}: missing link ${target}`);
  }
}
assert.equal(catalog.provenance.original_json_available, false);
assert.equal(catalog.provenance.original_patch_available, false);
assert.equal(catalog.provenance.sha256, "9c60f450ed6815cd9dab034988e20777e4fd243c0a5465337967765c1f7e4224");
console.log("Execution plan: 60 cards / 57 required / 51 product / 6 engineering / 3 conditional; 11 Proposed decisions; 68-node acyclic task/gate graph; 24 scenes and aliases; 7 negative self-tests: OK");
