import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadCatalog, root, validateCatalog } from "./catalog-check.mjs";

const start = "<!-- ownership-catalog:start -->";
const end = "<!-- ownership-catalog:end -->";
const path = resolve(root, "docs/architecture/invariant-ownership-baseline.md");
const cell = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
export function renderCatalog(catalog) {
  validateCatalog(catalog);
  const lines = [start, "", "以下两表由 [catalog.json](../spikes/invariant-ownership/catalog.json) 生成；不得手工维护第二份映射。公开入口从所属包的 `src/index.ts` 验证，精确测试名通过真实 Node 测试执行验证。角色/限制仍需人工审查，测试通过不自动证明 owner 正确或功能完整。", ""];
  for (const [maturity, title] of [["formal-v1", "已实现的正式 v1 边界"], ["bootstrap-sentinel", "架构哨兵与明确缺口"]]) {
    lines.push(`## ${title}`, "", "| 不变量 ID / 唯一 owner | 公开入口 | 已有正反测试 | 限制 |", "|---|---|---|---|");
    for (const invariant of catalog.invariants.filter((item) => item.maturity === maturity)) {
      const owner = invariant.owners[0];
      const entries = invariant.entries.map((entry) => `[${entry.export}${entry.method ? `.${entry.method}` : ""}](../../packages/${owner}/src/index.ts)`).join("；");
      const tests = invariant.tests.map((test) => `${{positive: "正", negative: "反", "positive-and-negative": "正/反"}[test.role]}：[${test.name}](../../${test.file})`).join("；");
      lines.push(`| ${invariant.id} / \`${owner}\`：${cell(invariant.summary)} | ${entries} | ${cell(tests)} | ${cell(invariant.limitations)} |`);
    }
    lines.push("");
  }
  lines.push("Runtime 事实分类/来源还由已接受 [ADR 0005](../adr/0005-normalized-runtime-event-v1.md)及其专项测试限定。本目录不是全部字段断言的穷举，也不替代完整测试矩阵。域 ID 构造器仅 trim/非空检查，不负责全局唯一性；协议 eventId、Ledger row、bootstrap Observation 与本目录 ID 的重复语义各自独立。", "", end);
  return lines.join("\n");
}
export function checkRenderedCatalog(catalog) {
  const document = readFileSync(path, "utf8");
  assert.equal(document.split(start).length, 2, "Missing/duplicate generated start marker");
  assert.equal(document.split(end).length, 2, "Missing/duplicate generated end marker");
  const actual = document.slice(document.indexOf(start), document.indexOf(end) + end.length);
  assert.equal(actual, renderCatalog(catalog), "Generated ownership mapping drift; regenerate from catalog.json");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.ok(process.argv.length === 3 && ["--write", "--check"].includes(process.argv[2]), "Use --write or --check");
  const catalog = loadCatalog();
  if (process.argv[2] === "--write") {
    const document = readFileSync(path, "utf8");
    assert.equal(document.split(start).length, 2);
    assert.equal(document.split(end).length, 2);
    writeFileSync(path, document.slice(0, document.indexOf(start)) + renderCatalog(catalog) + document.slice(document.indexOf(end) + end.length));
  }
  checkRenderedCatalog(catalog);
  console.log("Generated ownership mapping: OK");
}
