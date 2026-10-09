import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const plan = JSON.parse(read("docs/planning/development-plan.json"));
const legacy = JSON.parse(read("docs/planning/work-packages.json"));
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const ids = (values) => values.map((item) => item.id);
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label}: duplicates`);

function validate(data) {
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.baseline, "design-v2");
  assert.equal(data.status, "design-only", "Design catalog is not a completion database");
  assert.match(data.baselineHead, /^[a-f0-9]{40}$/);
  unique(ids(data.phases), "phases");
  unique(ids(data.tasks), "tasks");
  unique(ids(data.scenarios), "scenarios");
  assert.ok(data.phases.some((phase) => phase.id === data.currentPhase));
  const taskMap = new Map(data.tasks.map((task) => [task.id, task]));
  const scenarios = new Set(ids(data.scenarios));
  const covered = new Set();
  for (const task of data.tasks) {
    assert.match(task.id, /^(?:P[0-5]|X[245])-\d{2}$/);
    assert.ok(["required", "conditional"].includes(task.kind));
    assert.ok(["R2", "R3"].includes(task.risk));
    assert.equal(task.kind === "required", task.id.startsWith("P"));
    if (task.kind === "required") {
      assert.equal(task.phase, task.id.split("-")[0]);
      assert.ok(data.phases.some((phase) => phase.id === task.phase));
      assert.equal(task.condition, null);
    } else assert.ok(nonempty(task.condition));
    for (const field of ["title", "outcome", "rollback", "nonGoals"]) assert.ok(nonempty(task[field]), `${task.id}: ${field}`);
    for (const field of ["paths", "contracts", "acceptance", "failures", "scenarios"]) {
      assert.ok(Array.isArray(task[field]) && task[field].length > 0, `${task.id}: ${field}`);
      assert.ok(task[field].every(nonempty));
      unique(task[field], `${task.id}: ${field}`);
    }
    unique(task.depends, `${task.id}: dependencies`);
    for (const dependency of task.depends) {
      assert.ok(taskMap.has(dependency), `${task.id}: unknown dependency ${dependency}`);
      if (task.kind === "required") assert.equal(taskMap.get(dependency).kind, "required", "Required work cannot depend on optional work");
    }
    for (const path of [...task.paths, ...task.contracts]) {
      assert.ok(/^(?:apps|packages|docs)\/[a-zA-Z0-9_./-]+$/.test(path) && !path.split("/").includes(".."), `Unsafe path ${path}`);
    }
    for (const path of task.contracts) assert.ok(existsSync(resolve(root, path)), `Missing contract ${path}`);
    for (const scenario of task.scenarios) { assert.ok(scenarios.has(scenario), `Unknown scenario ${scenario}`); covered.add(scenario); }
  }
  assert.deepEqual([...covered].sort(), [...scenarios].sort(), "Unowned scenario");
  const active = new Set(), done = new Set();
  function visit(id) {
    assert.ok(!active.has(id), `Dependency cycle at ${id}`);
    if (done.has(id)) return;
    active.add(id);
    for (const dependency of taskMap.get(id).depends) visit(dependency);
    active.delete(id); done.add(id);
  }
  for (const id of taskMap.keys()) visit(id);
  for (const phase of data.phases) {
    assert.ok(nonempty(phase.title) && nonempty(phase.gate));
    assert.ok(data.tasks.some((task) => task.phase === phase.id && task.kind === "required"), `Empty phase ${phase.id}`);
  }
  unique(ids(data.legacyMap), "legacy mapping");
  assert.deepEqual(ids(data.legacyMap).sort(), ids(legacy.work_packages).sort(), "Legacy work must not disappear");
  for (const mapping of data.legacyMap) {
    assert.equal(mapping.title, legacy.work_packages.find((item) => item.id === mapping.id).title);
    assert.ok(["reused", "maintenance", "conditional", "replanned"].includes(mapping.disposition));
    assert.ok(nonempty(mapping.reason));
    assert.ok(mapping.targets.length > 0 || ["reused", "maintenance"].includes(mapping.disposition));
    unique(mapping.targets, mapping.id);
    assert.ok(mapping.targets.every((target) => taskMap.has(target)), `Unknown legacy target ${mapping.id}`);
  }
  for (const adr of data.decisionAdrs) assert.ok(existsSync(resolve(root, adr)), `Missing ADR ${adr}`);
}

function render(data) {
  const lines = ["# 完整开发计划", "", "由 development-plan.json 生成；修改 JSON 后运行 node scripts/check-design-plan.mjs --write。全部任务是计划，不表示已完成；当前进度见 next-task-handoff.md 与真实 Issue/PR。", "", "每个任务对应一个可独立验收的 execution Issue/primary PR；范围过大时先保持同一用户结果拆分并更新依赖。每项均须 npm run check、相关场景、实际失败/恢复证据及 R2/R3 独立审查；高风险使用受控合成/测试资源。代码未完成或证据缺失不得勾选验收。", "", "先完成依赖再实施；同阶段没有依赖的任务允许设计/阅读准备，但遵守仓库 WIP 上限。条件任务不阻塞必需阶段。工期取决于实际证据，不按任务数推算日期。", "", "## 阶段", "", "| 阶段 | 用户结果 | 退出门 |", "|---|---|---|"];
  for (const phase of data.phases) lines.push(`| ${phase.id} | ${phase.title} | ${phase.gate} |`);
  lines.push("", "## 任务依赖总览", "", "| ID | 任务 | 前置 | 风险 |", "|---|---|---|---|");
  for (const task of data.tasks) lines.push(`| ${task.id} | ${task.title} | ${task.depends.join(", ") || "无"} | ${task.risk} |`);
  for (const task of data.tasks) {
    lines.push("", `## ${task.id} · ${task.title}`, "", `**结果：**${task.outcome}`, "", `**前置：**${task.depends.join(", ") || "无"}；**风险：**${task.risk}；**类型：**${task.kind === "required" ? "必需" : "条件扩展"}。`);
    if (task.condition) lines.push("", `**启用条件：**${task.condition}`);
    lines.push("", `**触及：**${task.paths.map((path) => `\`${path}\``).join("、")}。`, "", `**合同：**${task.contracts.map((path) => `[${path.split("/").at(-1)}](../../${path})`).join("、")}。`, "", "**完成条件：**", "", ...task.acceptance.map((value) => `- ${value}`), "", "**必须验证的失败：**", "", ...task.failures.map((value) => `- ${value}`), "", `**场景：**${task.scenarios.join(", ")}。`, "", `**回滚：**${task.rollback}`, "", `**不做：**${task.nonGoals}`);
  }
  lines.push("", "## 场景归属", "", "| ID | 场景 | 实施/验收任务 |", "|---|---|---|");
  for (const scenario of data.scenarios) lines.push(`| ${scenario.id} | ${scenario.title} | ${data.tasks.filter((task) => task.scenarios.includes(scenario.id)).map((task) => task.id).join(", ")} |`);
  lines.push("", "## 原工作包完整映射", "", "此映射覆盖原 60 个工作包。reused 仅复用原有限成果；replanned 不继承旧完成状态；conditional 是明确缩小首版承诺；maintenance 保留独立维护队列。", "", "| 原 ID / 名称 | 处置 | 新任务 | 原因 |", "|---|---|---|---|");
  for (const row of data.legacyMap) lines.push(`| ${row.id} ${row.title} | ${row.disposition} | ${row.targets.join(", ") || "保留既有成果/队列"} | ${row.reason} |`);
  return lines.join("\n") + "\n";
}

validate(plan);
for (const mutate of [
  (p) => { p.tasks[1].id = p.tasks[0].id; },
  (p) => { p.tasks[0].depends.push("P9-99"); },
  (p) => { p.tasks[0].depends.push(p.tasks[1].id); },
  (p) => { p.tasks[0].depends.push("X2-01"); },
  (p) => { p.legacyMap.pop(); },
  (p) => { p.tasks[0].scenarios.push("Z99"); },
  (p) => { p.tasks[0].rollback = ""; },
  (p) => { p.tasks[0].contracts = ["../../secret"]; },
  (p) => { p.status = "complete"; },
]) { const changed = structuredClone(plan); mutate(changed); assert.throws(() => validate(changed)); }

assert.equal(createHash("sha256").update(read("docs/planning/work-packages.json")).digest("hex"), "3f5bb54e33fa4c31420df04cf9a167142dac78fd5cd57481222dbdf01afd8ec5", "Historical plan changed");
const config = JSON.parse(read("harness.config.json"));
assert.equal(plan.currentPhase, config.currentMilestone, "Active plan/config milestone mismatch");
const state = read("docs/harness/project-state.md");
assert.ok(state.includes(`milestone: ${plan.currentPhase}\n`));
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--write"), "Usage: node scripts/check-design-plan.mjs [--write]");
const output = "docs/planning/implementation-plan.md";
if (args[0] === "--write") writeFileSync(resolve(root, output), render(plan));
assert.equal(read(output), render(plan), "Generated task plan drift; run --write");
console.log(`Design plan: ${plan.tasks.length} tasks, ${plan.scenarios.length} scenarios, ${plan.legacyMap.length} legacy mappings; DAG and 9 negative checks OK. Product completion NOT evaluated.`);
