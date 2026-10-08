import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { resolve, sep } from "node:path";

export const OVERLAY_PATH = "docs/planning/current-decisions.json";
export const VIEW_PATH = "docs/planning/current-decisions.md";
export const SOURCE = Object.freeze({
  baselineHead: "9242e8cd12747b1517b2a0f3ae8e13f0cb94aa4d",
  path: "docs/planning/work-packages.json",
  sha256: "3f5bb54e33fa4c31420df04cf9a167142dac78fd5cd57481222dbdf01afd8ec5",
  compilationSha256: "9c60f450ed6815cd9dab034988e20777e4fd243c0a5465337967765c1f7e4224",
  checkerPath: "scripts/check-execution-plan.mjs",
  checkerSha256: "bf2fd897ccde978ec75d3b186ca691acc36f90d48dc47f6cb60246414410c29f",
  registerPath: "docs/planning/decision-register.md",
  registerSha256: "6e1ff85ea4f3e9ca0395e1c493eff78e506083ab05ed31a44cc4e1d833713329",
});
export const HISTORICAL_MARKER = "<!-- original-decision-register:start -->\n";
export const IDS = Array.from({ length: 11 }, (_, i) => `D-${String(i + 1).padStart(2, "0")}`);
const ADRS = {
  "D-01": ["docs/adr/0008-session-record-reconstruction-boundary.md"],
  "D-02": ["docs/adr/0009-ledger-schema-evolution-boundary.md"],
  "D-07": ["docs/adr/0011-formal-toolchain-baseline.md", "docs/adr/0013-pi-cli-jsonl-worker.md"],
  "D-10": ["docs/adr/0007-hard-core-soft-shell-ownership.md", "docs/adr/0010-package-owned-invariant-catalog.md"],
};
const ENTRY_POINTS = {
  "D-01": "docs/spikes/session-reconstruction/experiment.test.mjs",
  "D-02": "packages/memory-store/fixtures/schema-evolution/experiment.test.mjs",
  "D-07": "scripts/toolchain.test.mjs",
  "D-10": "docs/spikes/invariant-ownership/experiment.test.mjs",
};
const TERMINAL = ["Accepted", "Rejected", "Superseded"];
const TRANSITIONS = { Proposed: ["Evidence Ready"], "Evidence Ready": TERMINAL, Accepted: [], Rejected: [], Superseded: [] };
const REPOSITORY = "https://github.com/ntygod/zhiwei-next";
export const sha256 = (input) => createHash("sha256").update(input).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function exact(object, keys, label) {
  assert.ok(object && typeof object === "object" && !Array.isArray(object), `${label}: expected object`);
  assert.deepEqual(Object.keys(object).sort(), [...keys].sort(), `${label}: missing or unknown fields`);
}
function text(value, label) { assert.ok(typeof value === "string" && value.trim().length > 0, `${label}: required text`); }
function uniqueStrings(values, label, nonempty = true) {
  assert.ok(Array.isArray(values) && (!nonempty || values.length > 0), `${label}: required list`);
  values.forEach((value) => text(value, label));
  assert.equal(new Set(values).size, values.length, `${label}: duplicates`);
}
function hash(value, size, label) { assert.ok(typeof value === "string" && new RegExp(`^[a-f0-9]{${size}}$`).test(value), `${label}: full lowercase digest required`); }
function date(value) { assert.ok(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value)), "observedAt: UTC timestamp required"); }
function repoPath(path) {
  assert.ok(typeof path === "string" && /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith("/") && !path.split("/").some((part) => ["", ".", "..", ".git"].includes(part)), `Unsafe repository path: ${path}`);
  return path;
}
function pr(url) { assert.ok(new RegExp(`^${REPOSITORY.replaceAll(".", "\\.")}/pull/[1-9][0-9]*$`).test(url), "Expected repository PR URL (format only, not authentication)"); }
export function adrContent(text) {
  assert.equal([...text.matchAll(/^- 状态：[^\n]+$/gm)].length, 1, "ADR must contain exactly one status line");
  return text.replace(/^- 状态：[^\n]+$/m, "- 状态：<execution-state>");
}
export function proposalDigest(decision) {
  return sha256(canonical({ id: decision.id, adrs: decision.adrs, proposal: decision.proposal, evidence: decision.evidence, disposition: decision.disposition }));
}
export function repositoryReader(root) {
  return {
    read(path) {
      repoPath(path);
      let current = resolve(root);
      for (const part of path.split("/")) {
        current += sep + part;
        assert.ok(!lstatSync(current).isSymbolicLink(), `Symlink is not an evidence file: ${path}`);
      }
      assert.ok(lstatSync(current).isFile(), `Expected file: ${path}`);
      return readFileSync(current, "utf8");
    },
    blob(head, path) {
      hash(head, 40, "Git HEAD"); repoPath(path);
      assert.equal(execFileSync("git", ["cat-file", "-t", head], { cwd: root, encoding: "utf8" }).trim(), "commit", "HEAD must be a commit");
      const entry = execFileSync("git", ["ls-tree", head, "--", path], { cwd: root, encoding: "utf8" });
      assert.ok(/^100644 blob [0-9a-f]{40}\t/.test(entry), `Expected regular tracked evidence file: ${path}`);
      return execFileSync("git", ["show", `${head}:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    },
  };
}
function validateSource(data, io) {
  assert.deepEqual(data.source, SOURCE, "Frozen source identity drift");
  assert.equal(sha256(io.read(SOURCE.path)), SOURCE.sha256, "Frozen source snapshot bytes drift");
  assert.equal(sha256(io.read(SOURCE.checkerPath)), SOURCE.checkerSha256, "Original checker bytes drift");
  const register = io.read(SOURCE.registerPath);
  assert.equal(register.split(HISTORICAL_MARKER).length, 2, "Historical register boundary missing/duplicated");
  assert.equal(sha256(register.split(HISTORICAL_MARKER)[1]), SOURCE.registerSha256, "Original register content drift");
  assert.ok(register.split(HISTORICAL_MARKER)[0].includes("current-decisions.md"), "Historical register must point to current view");
  const source = JSON.parse(io.read(SOURCE.path));
  assert.equal(source.provenance.sha256, SOURCE.compilationSha256);
  assert.ok(Object.values(source.decision_statuses).every((status) => status === "Proposed"), "Source decisions are frozen Proposed");
  assert.ok(Object.values(source.milestone_gates).every((gate) => gate.status === "unverified"), "Source gates are frozen unverified");
}
function validateEvidence(evidence, io, { requireCurrent = true, currentLabel = "current" } = {}) {
  exact(evidence, ["sourcePr", "head", "observedAt", "node", "files", "runs"], "evidence");
  pr(evidence.sourcePr); hash(evidence.head, 40, "evidence HEAD"); date(evidence.observedAt);
  assert.match(evidence.node, /^22\.\d+\.\d+$/, "Node must include supported major and exact patch");
  assert.ok(Number(evidence.node.split(".")[1]) >= 16, "Node must satisfy repository supported range");
  assert.ok(Array.isArray(evidence.files) && evidence.files.length > 0, "Evidence Ready requires files");
  uniqueStrings(evidence.files.map((file) => file.path), "evidence paths");
  for (const file of evidence.files) {
    exact(file, ["path", "sha256"], "evidence file"); repoPath(file.path); hash(file.sha256, 64, "file digest");
    assert.equal(sha256(io.blob(evidence.head, file.path)), file.sha256, `${file.path}: historical evidence blob drift`);
    if (requireCurrent) assert.equal(sha256(io.read(file.path)), file.sha256, `${file.path}: ${currentLabel} evidence file drift; collect new evidence`);
  }
  assert.ok(Array.isArray(evidence.runs) && evidence.runs.length > 0, "Evidence Ready requires executed commands");
  const paths = new Set(evidence.files.map((file) => file.path));
  for (const run of evidence.runs) {
    exact(run, ["command", "entryPoint", "result"], "run");
    repoPath(run.entryPoint); assert.ok(paths.has(run.entryPoint), "Run entry point must be hashed evidence");
    assert.ok(run.command === `node --experimental-strip-types --test ${run.entryPoint}` || run.command === `node --experimental-strip-types ${run.entryPoint} --check`, "Only documented opt-in Node commands are represented; checker never executes data");
    exact(run.result, ["exitCode", "tests", "passed", "failed", "skipped", "todo"], "result");
    for (const count of Object.values(run.result)) assert.ok(Number.isSafeInteger(count) && count >= 0, "Invalid result count");
    assert.equal(run.result.exitCode, 0); assert.equal(run.result.tests, run.result.passed);
    assert.equal(run.result.failed + run.result.skipped + run.result.todo, 0, "Evidence run not wholly successful");
    if (run.command.includes(" --test ")) assert.ok(run.result.tests > 0, "No tests executed");
  }
}
function validateReview(decision, data, io) {
  const review = decision.decisionReview;
  exact(review, ["purpose", "decisionId", "primaryPr", "evidenceHead", "reviewedHead", "reviewUrl", "proposalSha256", "observedAt"], "decision review");
  assert.equal(review.purpose, `decision-${decision.status.toLowerCase()}`, "Experimental approval cannot accept a decision");
  assert.equal(review.decisionId, decision.id, "Review belongs to another decision");
  pr(review.primaryPr); hash(review.evidenceHead, 40, "decision evidence HEAD"); hash(review.reviewedHead, 40, "reviewed HEAD");
  assert.equal(review.evidenceHead, review.reviewedHead, "Review does not bind decision evidence HEAD");
  assert.ok(new RegExp(`^${review.primaryPr.replaceAll(".", "\\.")}#(?:issuecomment-|pullrequestreview-)[1-9][0-9]*$`).test(review.reviewUrl), "Review URL must name the same primary PR (format only)");
  assert.ok(!decision.evidence.some((entry) => entry.sourcePr === review.primaryPr), "Experiment PR cannot be reused as the new decision primary PR");
  date(review.observedAt); hash(review.proposalSha256, 64, "proposal digest");
  assert.equal(review.proposalSha256, proposalDigest(decision), "Review scope/ADR/evidence digest mismatch");
  const previous = JSON.parse(io.blob(review.reviewedHead, OVERLAY_PATH));
  assert.equal(previous.kind, data.kind); assert.equal(previous.schemaVersion, data.schemaVersion); assert.deepEqual(previous.source, data.source);
  validateSource(previous, { read: (path) => io.blob(review.reviewedHead, path) });
  const matches = previous.decisions.filter((item) => item.id === decision.id);
  assert.equal(matches.length, 1, "Reviewed decision identity missing/duplicate");
  const old = matches[0];
  assert.ok(["Evidence Ready", "Accepted"].includes(old.status), "Reviewed HEAD must contain prior evidence-ready decision proposal");
  assert.ok(TRANSITIONS[old.status].includes(decision.status), "Reviewed proposal cannot make requested transition");
  assert.deepEqual(decision.history, [...old.history, decision.status], "History must extend the actual reviewed proposal");
  assert.equal(proposalDigest(old), review.proposalSha256, "Reviewed HEAD did not contain the claimed decision scope");
  // The accepted choice keeps historical proof; its actual reviewed candidate must still match that proof.
  // Later product source may evolve without pretending this historical review approved the new implementation.
  for (const evidence of old.evidence) validateEvidence(evidence, {
    read: (path) => io.blob(review.reviewedHead, path), blob: (head, path) => io.blob(head, path),
  }, { requireCurrent: true, currentLabel: "reviewed-HEAD" });
  for (const adr of decision.adrs) {
    assert.equal(sha256(adrContent(io.blob(review.reviewedHead, adr.path))), adr.sha256, "ADR changed after decision review");
  }
  // This is deliberately not GitHub authentication. Final HEAD approval and live objects are existing governance responsibilities.
}
export function validateCurrentDecisions(data, io, { checkView = true } = {}) {
  exact(data, ["schemaVersion", "kind", "source", "decisions"], "overlay");
  assert.equal(data.schemaVersion, 1); assert.equal(data.kind, "execution-decision-overlay");
  validateSource(data, io);
  assert.ok(Array.isArray(data.decisions));
  assert.deepEqual(data.decisions.map((item) => item.id).sort(), IDS, "Unknown, missing or duplicate decision ID");
  for (const decision of data.decisions) {
    exact(decision, ["id", "status", "history", "adrs", "proposal", "evidence", "decisionReview", "disposition"], decision.id);
    assert.ok(Object.hasOwn(TRANSITIONS, decision.status), "Unknown decision status");
    assert.ok(Array.isArray(decision.history) && decision.history[0] === "Proposed", "History must start Proposed");
    assert.equal(decision.history.at(-1), decision.status, "History/status mismatch");
    for (let i = 1; i < decision.history.length; i++) assert.ok(TRANSITIONS[decision.history[i - 1]]?.includes(decision.history[i]), "Illegal decision transition");
    assert.ok(Array.isArray(decision.adrs) && Array.isArray(decision.evidence));
    assert.deepEqual(decision.adrs.map((adr) => adr.path), ADRS[decision.id] ?? [], "Decision/ADR ownership mismatch");
    for (const adr of decision.adrs) {
      exact(adr, ["path", "sha256"], "ADR"); repoPath(adr.path); hash(adr.sha256, 64, "ADR digest");
      const content = io.read(adr.path);
      const expected = TERMINAL.includes(decision.status) ? decision.status : "Proposed";
      assert.ok(content.includes(`- 状态：${expected}\n`), "ADR/current status drift");
      assert.ok(content.includes(`- 计划决策：${decision.id}`), "ADR belongs to another decision");
      assert.equal(sha256(adrContent(content)), adr.sha256, "ADR content drift");
    }
    if (decision.status === "Proposed") {
      assert.deepEqual(decision.history, ["Proposed"]);
      assert.equal(decision.proposal, null); assert.deepEqual(decision.evidence, []);
    } else {
      assert.ok(decision.adrs.length > 0, "Evidence Ready requires formal ADR");
      exact(decision.proposal, ["selection", "scope", "nonGuarantees", "remainingGates"], "proposal");
      text(decision.proposal.selection, "selection");
      for (const key of ["scope", "nonGuarantees", "remainingGates"]) uniqueStrings(decision.proposal[key], key);
      assert.ok(decision.evidence.length > 0, "Evidence Ready requires experimental evidence");
      decision.evidence.forEach((evidence) => validateEvidence(evidence, io, { requireCurrent: decision.status === "Evidence Ready" }));
      assert.ok(decision.evidence.some((evidence) => evidence.runs.some((run) => run.entryPoint === ENTRY_POINTS[decision.id])), "Missing decision-specific experimental path");
    }
    if (TERMINAL.includes(decision.status)) validateReview(decision, data, io);
    else assert.equal(decision.decisionReview, null, "Unaccepted proposal cannot claim decision review");
    if (["Rejected", "Superseded"].includes(decision.status) || (decision.status === "Evidence Ready" && decision.disposition !== null)) {
      exact(decision.disposition, ["reason", "replacementAdr"], "disposition"); text(decision.disposition.reason, "disposition reason");
      if (decision.status === "Superseded" || (decision.status === "Evidence Ready" && decision.disposition.replacementAdr !== null)) {
        repoPath(decision.disposition.replacementAdr);
        assert.ok(!decision.adrs.some((adr) => adr.path === decision.disposition.replacementAdr), "Cannot supersede itself");
        assert.ok(io.read(decision.disposition.replacementAdr).includes("- 状态：Accepted\n"), "Replacement ADR must be accepted");
      } else assert.equal(decision.disposition.replacementAdr, null);
    } else assert.equal(decision.disposition, null);
  }
  if (checkView) assert.equal(io.read(VIEW_PATH), renderCurrentDecisions(data), "Generated current decision register drift");
  return { decisions: data.decisions.length, accepted: data.decisions.filter((item) => item.status === "Accepted").map((item) => item.id), githubApprovalAuthenticated: false, stageCompletionEvaluated: false, currentProductApplicabilityEvaluated: false };
}
export function renderCurrentDecisions(data) {
  const lines = ["# 当前执行决议", "", "由 current-decisions.json 生成；运行 node scripts/check-current-decisions.mjs --write-view 更新。原提案见 [历史源登记](decision-register.md)，表示合同见 [执行状态层说明](decision-execution-layer.md)。", "", "Evidence Ready 只表示有限证据待决策审查；Accepted 只覆盖该项文字范围。这里不计算 G-1、任何工作包或阶段完成，不授予产品入口权限。Evidence Ready 校验当前候选文件；终态只保留历史证据一致性，不评估当前产品适用性。GitHub URL 与本地摘要不是批准认证；最终完整 HEAD 的独立审查、CI 与合并仍遵守既有治理。", "", `冻结源：${data.source.path}，SHA-256 \`${data.source.sha256}\`。`, ""];
  for (const d of data.decisions) {
    lines.push(`## ${d.id}`, "", `当前状态：**${d.status}**`, "", `状态路径：${d.history.join(" → ")}`, "");
    for (const adr of d.adrs) lines.push(`- ADR：[${adr.path}](../../${adr.path})；正文摘要（仅归一化状态行）：\`${adr.sha256}\``);
    if (d.proposal) {
      lines.push("", `有限选择：${d.proposal.selection}`, "", `决议范围摘要：\`${proposalDigest(d)}\``, "");
      for (const [key, label] of [["scope", "适用范围"], ["nonGuarantees", "非保证"], ["remainingGates", "保留前置"]]) lines.push(`### ${label}`, "", ...d.proposal[key].map((value) => `- ${value}`), "");
      lines.push("### 实验身份与观测", "");
      for (const e of d.evidence) {
        lines.push(`- 实验来源：[${e.sourcePr}](${e.sourcePr})；完整 HEAD \`${e.head}\`；观测 ${e.observedAt}；Node ${e.node}`);
        for (const f of e.files) lines.push(`  - [${f.path}](${REPOSITORY}/blob/${e.head}/${f.path})（历史快照）：\`${f.sha256}\``);
        for (const r of e.runs) lines.push(`- 命令：\`${r.command}\`；exit ${r.result.exitCode}，tests/pass ${r.result.tests}/${r.result.passed}，fail/skip/todo ${r.result.failed}/${r.result.skipped}/${r.result.todo}`);
      }
      lines.push("");
    }
    if (d.decisionReview) lines.push(`决策审查记录：[${d.decisionReview.purpose}](${d.decisionReview.reviewUrl})；被审 HEAD \`${d.decisionReview.reviewedHead}\`；绑定 ${d.decisionReview.decisionId} / \`${d.decisionReview.proposalSha256}\`；记录观测 ${d.decisionReview.observedAt}。其真实性/完整范围须查远端原文；该历史记录不批准后续完整 HEAD。`, "");
    else lines.push("正式决策审查：尚无；实验 PR 的批准不用于接受本决议。", "");
    if (d.disposition) lines.push(`处置：${d.disposition.reason}；替代 ADR：${d.disposition.replacementAdr ?? "无"}`, "");
  }
  return lines.join("\n");
}
