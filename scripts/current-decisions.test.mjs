import assert from "node:assert/strict";
import * as fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { writeCurrentDecisionsView } from "./write-current-decisions-view.mjs";
import test from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE, OVERLAY_PATH, VIEW_PATH, HISTORICAL_MARKER, repositoryReader, validateCurrentDecisions,
  renderCurrentDecisions, proposalDigest, sha256, adrContent } from "./current-decisions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const real = repositoryReader(root);
const baseline = JSON.parse(readFileSync(resolve(root, OVERLAY_PATH), "utf8"));
const files = new Map();
const blobs = new Map();
// Synthetic fixtures are built from recorded historical evidence, so the tests themselves do not freeze later product files.
// The first repository integration test still validates the actual current filesystem through `real`.
const fixtureEvidenceHeads = new Map(baseline.decisions.flatMap((d) => d.evidence.flatMap((e) => e.files.map((f) => [f.path, e.head]))));
function cachedRead(path) { if (!files.has(path)) { const content = fixtureEvidenceHeads.has(path) ? cachedBlob(fixtureEvidenceHeads.get(path), path) : real.read(path); files.set(path, path.startsWith("docs/adr/") ? content.replace(/^- 状态：[^\n]+$/m, "- 状态：Proposed") : content); } return files.get(path); }
function cachedBlob(head, path) { const key = `${head}:${path}`; if (!blobs.has(key)) blobs.set(key, real.blob(head, path)); return blobs.get(key); }
const REVIEW_HEAD = "1234567890abcdef1234567890abcdef12345678"; // Synthetic only; never published or claimed to exist.
function fixture({ accepted = false } = {}) {
  const data = structuredClone(baseline);
  for (const d of data.decisions.filter((d) => ["D-01", "D-02", "D-10"].includes(d.id))) { d.status = "Evidence Ready"; d.history = ["Proposed", "Evidence Ready"]; d.decisionReview = null; d.disposition = null; }
  const overrides = new Map();
  const historical = new Map();
  const io = {
    read: (path) => overrides.has(path) ? overrides.get(path) : path === VIEW_PATH ? renderCurrentDecisions(data) : cachedRead(path),
    blob: (head, path) => historical.has(`${head}:${path}`) ? historical.get(`${head}:${path}`) : cachedBlob(head, path),
  };
  if (accepted) {
    // In-memory simulated independent decision review, not a real approval fixture.
    const old = structuredClone(data);
    historical.set(`${REVIEW_HEAD}:${OVERLAY_PATH}`, JSON.stringify(old));
    for (const path of [SOURCE.path, SOURCE.checkerPath, SOURCE.registerPath]) historical.set(`${REVIEW_HEAD}:${path}`, cachedRead(path));
    for (const decision of data.decisions.filter((d) => d.status === "Evidence Ready")) {
      for (const evidence of decision.evidence) for (const file of evidence.files) historical.set(`${REVIEW_HEAD}:${file.path}`, cachedRead(file.path));
      for (const adr of decision.adrs) {
        historical.set(`${REVIEW_HEAD}:${adr.path}`, cachedRead(adr.path));
        overrides.set(adr.path, cachedRead(adr.path).replace("- 状态：Proposed\n", "- 状态：Accepted\n"));
      }
      decision.status = "Accepted"; decision.history.push("Accepted");
      decision.decisionReview = { purpose: "decision-accepted", decisionId: decision.id,
        primaryPr: "https://github.com/ntygod/zhiwei-next/pull/999", evidenceHead: REVIEW_HEAD, reviewedHead: REVIEW_HEAD,
        reviewUrl: "https://github.com/ntygod/zhiwei-next/pull/999#issuecomment-123456789",
        proposalSha256: proposalDigest(decision), observedAt: "2026-10-08T14:00:00Z" };
    }
  }
  return { data, overrides, historical, io, d: data.decisions[0] };
}
function rejects(name, mutate, error, options) {
  test(name, () => { const f = fixture(options); mutate(f); assert.throws(() => validateCurrentDecisions(f.data, f.io), error); });
}

test("real repository records match actual current files and historical Git blobs", () => {
  const result = validateCurrentDecisions(baseline, real);
  assert.equal(result.decisions, 11);
  assert.deepEqual(result.accepted, baseline.decisions.filter((d) => d.status === "Accepted").map((d) => d.id));
  assert.equal(result.githubApprovalAuthenticated, false);
  assert.equal(result.stageCompletionEvaluated, false);
  assert.equal(result.currentProductApplicabilityEvaluated, false);
});
test("synthetic accepted records bind each decision and exact ADR body to a prior evidence-ready HEAD", () => {
  const f = fixture({ accepted: true });
  const result = validateCurrentDecisions(f.data, f.io);
  assert.deepEqual(result.accepted, ["D-01", "D-02", "D-10"]);
  assert.equal(result.githubApprovalAuthenticated, false);
  assert.equal(result.stageCompletionEvaluated, false);
  assert.equal(result.currentProductApplicabilityEvaluated, false);
});
test("canonical digest ignores JSON key order, but includes actual finite text, ADR and evidence content", () => {
  const f = fixture(); const d = f.d;
  assert.equal(proposalDigest(d), proposalDigest({ evidence: d.evidence, proposal: d.proposal, adrs: d.adrs, id: d.id, disposition: d.disposition }));
  const old = proposalDigest(d); d.proposal.scope[0] += " changed"; assert.notEqual(proposalDigest(d), old);
});
test("source historical register retains original bytes after its navigation prefix", () => {
  assert.equal(sha256(real.read(SOURCE.registerPath).split(HISTORICAL_MARKER)[1]), SOURCE.registerSha256);
});
rejects("unknown decision ID", (f) => f.d.id = "D-12", /Unknown, missing or duplicate/);
rejects("duplicate decision ID", (f) => f.data.decisions[1].id = "D-01", /Unknown, missing or duplicate/);
rejects("missing decision", (f) => f.data.decisions.pop(), /Unknown, missing or duplicate/);
rejects("unknown overlay control cannot automatically mark G-1 complete", (f) => f.data.g1Complete = true, /unknown fields/);
rejects("no automatic work package completion field", (f) => f.data.workPackages = { "G-1": "completed" }, /unknown fields/);
rejects("no automatic milestone gate field", (f) => f.data.milestoneGates = { M0: "completed" }, /unknown fields/);
rejects("unknown decision field cannot hide approval", (f) => f.d.approved = true, /unknown fields/);
rejects("unknown schema", (f) => f.data.schemaVersion = 2, /1/);
rejects("unknown state", (f) => f.d.status = "Complete", /Unknown decision status/);
rejects("history must start Proposed", (f) => f.d.history = ["Evidence Ready"], /History must start/);
rejects("status cannot disagree with history", (f) => f.d.history = ["Proposed"], /History\/status/);
rejects("direct Proposed to Accepted is illegal", (f) => { f.d.status = "Accepted"; f.d.history = ["Proposed", "Accepted"]; }, /Illegal decision transition/);
rejects("reverse transition is illegal", (f) => { f.d.status = "Proposed"; f.d.history.push("Proposed"); }, /Illegal decision transition/);
rejects("repeated transition is illegal", (f) => f.d.history.push("Evidence Ready"), /Illegal decision transition/);
rejects("source hash drift", (f) => f.data.source.sha256 = "a".repeat(64), /Frozen source identity/);
rejects("source Proposed cannot be overwritten", (f) => f.overrides.set(SOURCE.path, cachedRead(SOURCE.path).replace('"D-01": "Proposed"', '"D-01": "Accepted"')), /Frozen source snapshot bytes/);
rejects("source stage cannot be completed", (f) => f.overrides.set(SOURCE.path, cachedRead(SOURCE.path).replace('"unverified"', '"completed"')), /Frozen source snapshot bytes/);
rejects("original checker may not be relaxed", (f) => f.overrides.set(SOURCE.checkerPath, cachedRead(SOURCE.checkerPath) + "\n"), /Original checker bytes/);
rejects("original Markdown Proposed stays frozen", (f) => f.overrides.set(SOURCE.registerPath, cachedRead(SOURCE.registerPath).replace("状态：**Proposed**", "状态：**Accepted**")), /Original register content/);
rejects("source marker cannot be removed", (f) => f.overrides.set(SOURCE.registerPath, cachedRead(SOURCE.registerPath).replace(HISTORICAL_MARKER, "")), /boundary/);
rejects("current Markdown cannot drift", (f) => f.overrides.set(VIEW_PATH, renderCurrentDecisions(f.data) + "\nAccepted"), /register drift/);
rejects("ADR state cannot drift", (f) => f.overrides.set(f.d.adrs[0].path, cachedRead(f.d.adrs[0].path).replace("- 状态：Proposed", "- 状态：Accepted")), /ADR\/current status/);
rejects("ADR body cannot drift", (f) => f.overrides.set(f.d.adrs[0].path, cachedRead(f.d.adrs[0].path) + "extra promise\n"), /ADR content drift/);
rejects("duplicate ADR status line fails", (f) => f.overrides.set(f.d.adrs[0].path, cachedRead(f.d.adrs[0].path) + "- 状态：Proposed\n"), /exactly one status/);
rejects("Evidence Ready without ADR", (f) => f.d.adrs = [], /ADR ownership/);
rejects("Evidence Ready without experiments", (f) => f.d.evidence = [], /experimental evidence/);
rejects("Evidence Ready without scope", (f) => f.d.proposal.scope = [], /scope/);
rejects("Evidence Ready without non-guarantees", (f) => f.d.proposal.nonGuarantees = [], /nonGuarantees/);
rejects("Evidence Ready without remaining gates", (f) => f.d.proposal.remainingGates = [], /remainingGates/);
rejects("evidence file hash drift", (f) => f.d.evidence[0].files[0].sha256 = "a".repeat(64), /historical evidence blob/);
rejects("evidence file changed in current worktree", (f) => { const p = f.d.evidence[0].files[0].path; f.overrides.set(p, cachedRead(p) + "\n"); }, /current evidence file drift/);
rejects("historical evidence Git blob drift", (f) => { const e = f.d.evidence[0]; f.historical.set(`${e.head}:${e.files[0].path}`, "drift"); }, /historical evidence blob/);
rejects("short evidence HEAD", (f) => f.d.evidence[0].head = "9242e8c", /full lowercase digest/);
rejects("numeric HEAD is not a string", (f) => f.d.evidence[0].head = 123, /full lowercase digest/);
rejects("empty evidence files", (f) => f.d.evidence[0].files = [], /requires files/);
rejects("duplicate evidence file", (f) => f.d.evidence[0].files.push(f.d.evidence[0].files[0]), /duplicates/);
rejects("path traversal evidence", (f) => f.d.evidence[0].files[0].path = "../outside", /Unsafe repository path/);
rejects("Git option cannot be evidence path", (f) => f.d.evidence[0].files[0].path = "/tmp/outside", /Unsafe repository path/);
rejects("no commands recorded", (f) => f.d.evidence[0].runs = [], /executed commands/);
rejects("run entry must be hashed", (f) => f.d.evidence[0].runs[0].entryPoint = "fake.mjs", /hashed evidence/);
rejects("arbitrary shell command is data and is rejected", (f) => f.d.evidence[0].runs[0].command = "node test.mjs; touch /tmp/bad", /Only documented/);
rejects("unhashed executable alias rejected", (f) => f.d.evidence[0].runs[0].command = "npm run check", /Only documented/);
rejects("D10 evidence cannot replace D01 experiment", (f) => f.d.evidence = structuredClone(f.data.decisions[9].evidence), /decision-specific/);
rejects("Node patch missing", (f) => f.d.evidence[0].node = "22", /exact patch/);
rejects("unsupported Node patch range", (f) => f.d.evidence[0].node = "22.1.0", /supported range/);
rejects("nonzero exit", (f) => f.d.evidence[0].runs[0].result.exitCode = 1);
rejects("skipped run not evidence-ready", (f) => f.d.evidence[0].runs[0].result.skipped = 1, /not wholly successful/);
rejects("zero matched tests not evidence-ready", (f) => { f.d.evidence[0].runs[0].result.tests = 0; f.d.evidence[0].runs[0].result.passed = 0; }, /No tests executed/);
rejects("Proposed cannot smuggle evidence-ready content", (f) => { f.d.status = "Proposed"; f.d.history = ["Proposed"]; });
rejects("Accepted missing actual review record", (f) => f.d.decisionReview = null, /decision review/, { accepted: true });
rejects("Accepted missing primary PR", (f) => delete f.d.decisionReview.primaryPr, /unknown fields/, { accepted: true });
rejects("Accepted missing review URL", (f) => delete f.d.decisionReview.reviewUrl, /unknown fields/, { accepted: true });
rejects("Accepted short reviewed HEAD", (f) => f.d.decisionReview.reviewedHead = "1234567", /full lowercase digest/, { accepted: true });
rejects("reviewed HEAD must match decision evidence HEAD", (f) => f.d.decisionReview.reviewedHead = "b".repeat(40), /does not bind/, { accepted: true });
rejects("experimental approval is not decision approval", (f) => f.d.decisionReview.purpose = "experiment-approval", /Experimental approval/, { accepted: true });
rejects("historical experiment PR79 cannot accept D01", (f) => { f.d.decisionReview.primaryPr = "https://github.com/ntygod/zhiwei-next/pull/79"; f.d.decisionReview.reviewUrl = f.d.decisionReview.primaryPr + "#issuecomment-6061229854"; }, /Experiment PR cannot/, { accepted: true });
rejects("historical experiment PR77 cannot accept D10", (f) => { const d = f.data.decisions[9]; d.decisionReview.primaryPr = "https://github.com/ntygod/zhiwei-next/pull/77"; d.decisionReview.reviewUrl = d.decisionReview.primaryPr + "#issuecomment-6060307202"; }, /Experiment PR cannot/, { accepted: true });
rejects("review cannot point to another PR", (f) => f.d.decisionReview.reviewUrl = "https://github.com/ntygod/zhiwei-next/pull/888#issuecomment-123", /same primary PR/, { accepted: true });
rejects("D10 decision review cannot be copied to D01", (f) => f.d.decisionReview = structuredClone(f.data.decisions[9].decisionReview), /another decision/, { accepted: true });
rejects("renaming D10 copied review still fails scope digest", (f) => { f.d.decisionReview = structuredClone(f.data.decisions[9].decisionReview); f.d.decisionReview.decisionId = "D-01"; }, /scope\/ADR\/evidence digest/, { accepted: true });
rejects("scope change after review requires new review", (f) => f.d.proposal.scope.push("Unreviewed wider guarantee"), /scope\/ADR\/evidence digest/, { accepted: true });
rejects("rewriting digest cannot change actually reviewed scope", (f) => { f.d.proposal.scope.push("Unreviewed wider guarantee"); f.d.decisionReview.proposalSha256 = proposalDigest(f.d); }, /did not contain/, { accepted: true });
rejects("rehashing changed ADR still fails prior decision digest", (f) => { const a = f.d.adrs[0]; const text = f.io.read(a.path) + "Unreviewed wider guarantee\n"; f.overrides.set(a.path, text); a.sha256 = sha256(adrContent(text)); f.d.decisionReview.proposalSha256 = proposalDigest(f.d); }, /did not contain/, { accepted: true });
rejects("reviewed ADR actual bytes must match, not only self-declared hash", (f) => { const a = f.d.adrs[0]; f.historical.set(`${REVIEW_HEAD}:${a.path}`, cachedRead(a.path) + "unreviewed\n"); }, /ADR changed after/, { accepted: true });
rejects("reviewed source snapshot must actually remain frozen", (f) => f.historical.set(`${REVIEW_HEAD}:${SOURCE.path}`, cachedRead(SOURCE.path) + "\n"), /Frozen source snapshot bytes/, { accepted: true });
rejects("accepted snapshot cannot claim to review itself", (f) => f.historical.set(`${REVIEW_HEAD}:${OVERLAY_PATH}`, JSON.stringify(f.data)), /requested transition/, { accepted: true });
rejects("reviewed snapshot must contain exact known decision", (f) => { const old = structuredClone(fixture().data); old.decisions.shift(); f.historical.set(`${REVIEW_HEAD}:${OVERLAY_PATH}`, JSON.stringify(old)); }, /identity missing/, { accepted: true });
test("reader rejects current filesystem symlinks without reading their target", () => {
  const temp = mkdtempSync(join(tmpdir(), "zhiwei-overlay-path-"));
  try { writeFileSync(join(temp, "real.mjs"), "synthetic"); symlinkSync("real.mjs", join(temp, "alias.mjs")); assert.throws(() => repositoryReader(temp).read("alias.mjs"), /Symlink/); }
  finally { rmSync(temp, { recursive: true, force: true }); }
});
test("reader treats Git identities as data and does not run shell fragments", () => {
  assert.throws(() => real.blob("--help; echo forged", "README.md"), /full lowercase digest/);
  assert.throws(() => real.blob(SOURCE.baselineHead, "../README.md"), /Unsafe repository path/);
});
function dispose(f, state) {
  f.d.status = state; f.d.history[f.d.history.length - 1] = state;
  f.d.decisionReview.purpose = `decision-${state.toLowerCase()}`;
  f.d.disposition = { reason: "Synthetic reviewed disposition only", replacementAdr: state === "Superseded" ? "docs/adr/synthetic-replacement.md" : null };
  for (const adr of f.d.adrs) f.overrides.set(adr.path, cachedRead(adr.path).replace("- 状态：Proposed\n", `- 状态：${state}\n`));
  if (state === "Superseded") f.overrides.set(f.d.disposition.replacementAdr, "# Synthetic replacement\n- 状态：Accepted\n");
  const reviewed = JSON.parse(f.historical.get(`${REVIEW_HEAD}:${OVERLAY_PATH}`));
  reviewed.decisions[0].disposition = structuredClone(f.d.disposition);
  f.historical.set(`${REVIEW_HEAD}:${OVERLAY_PATH}`, JSON.stringify(reviewed));
  f.d.decisionReview.proposalSha256 = proposalDigest(f.d);
}
test("reviewed rejection is explicit and never reports accepted decision", () => {
  const f = fixture({ accepted: true }); dispose(f, "Rejected");
  assert.ok(!validateCurrentDecisions(f.data, f.io).accepted.includes("D-01"));
});
test("reviewed supersession names a distinct accepted replacement ADR", () => {
  const f = fixture({ accepted: true }); dispose(f, "Superseded");
  assert.ok(!validateCurrentDecisions(f.data, f.io).accepted.includes("D-01"));
});
rejects("rejection needs a reason", (f) => { dispose(f, "Rejected"); f.d.disposition.reason = ""; }, /scope\/ADR\/evidence digest|required text/, { accepted: true });
rejects("supersession cannot replace itself", (f) => { dispose(f, "Superseded"); f.d.disposition.replacementAdr = f.d.adrs[0].path; }, /scope\/ADR\/evidence digest|Cannot supersede itself/, { accepted: true });
rejects("supersession cannot name merely proposed replacement", (f) => { dispose(f, "Superseded"); f.overrides.set(f.d.disposition.replacementAdr, "- 状态：Proposed\n"); }, /Replacement ADR must be accepted/, { accepted: true });

test("Accepted historical choice permits later changed implementation without claiming current approval", () => {
  const f = fixture({ accepted: true });
  const oldDigests = f.data.decisions.filter((d) => d.status === "Accepted").map(proposalDigest);
  const path = f.d.evidence[0].files[0].path;
  f.overrides.set(path, "Synthetic later product implementation, not reviewed by historical decision approval.\n");
  const result = validateCurrentDecisions(f.data, f.io);
  assert.deepEqual(result.accepted, ["D-01", "D-02", "D-10"]);
  assert.equal(result.githubApprovalAuthenticated, false);
  assert.equal(result.currentProductApplicabilityEvaluated, false);
  assert.equal(result.stageCompletionEvaluated, false);
  assert.deepEqual(f.data.decisions.filter((d) => d.status === "Accepted").map(proposalDigest), oldDigests);
});
test("Accepted evidence may live only in historical Git after later source relocation", () => {
  const f = fixture({ accepted: true });
  const path = f.d.evidence[0].files[0].path; const read = f.io.read;
  f.io.read = (p) => { if (p === path) throw new Error("No longer a current file"); return read(p); };
  assert.equal(validateCurrentDecisions(f.data, f.io).currentProductApplicabilityEvaluated, false);
});
rejects("Accepted still rejects tampered historical experiment hash", (f) => f.d.evidence[0].files[0].sha256 = "a".repeat(64), /historical evidence blob/, { accepted: true });
rejects("Accepted still rejects modified historical Git evidence bytes", (f) => { const e = f.d.evidence[0]; f.historical.set(`${e.head}:${e.files[0].path}`, "tampered history"); }, /historical evidence blob/, { accepted: true });
rejects("Accepted reviewed candidate actual source cannot drift from its declared evidence", (f) => { const path = f.d.evidence[0].files[0].path; f.historical.set(`${REVIEW_HEAD}:${path}`, "reviewed source differed from evidence"); }, /reviewed-HEAD evidence file drift/, { accepted: true });
test("evidence links always select exact historical commit instead of current product source", () => {
  const f = fixture({ accepted: true }); const e = f.d.evidence[0]; const path = e.files[0].path;
  const view = renderCurrentDecisions(f.data);
  assert.ok(view.includes(`https://github.com/ntygod/zhiwei-next/blob/${e.head}/${path}`));
  assert.ok(!view.includes(`](../../${path})`));
});
test("Accepted historical blob absence fails closed rather than falling back to current source", () => {
  const f = fixture({ accepted: true }); const e = f.d.evidence[0]; const path = e.files[0].path; const blob = f.io.blob;
  f.io.blob = (head, p) => { if (head === e.head && p === path) throw new Error("Historical Git blob unavailable"); return blob(head, p); };
  assert.throws(() => validateCurrentDecisions(f.data, f.io), /Historical Git blob unavailable/);
});
test("Accepted reviewed candidate blob absence fails closed", () => {
  const f = fixture({ accepted: true }); const path = f.d.evidence[0].files[0].path; const blob = f.io.blob;
  f.io.blob = (head, p) => { if (head === REVIEW_HEAD && p === path) throw new Error("Reviewed candidate Git blob unavailable"); return blob(head, p); };
  assert.throws(() => validateCurrentDecisions(f.data, f.io), /Reviewed candidate Git blob unavailable/);
});

function viewWorkspace(run) {
  const directory = mkdtempSync(join(tmpdir(), "zhiwei-view-write-"));
  const parent = join(directory, "docs/planning");
  fs.mkdirSync(parent, { recursive: true });
  const target = join(directory, VIEW_PATH);
  const source = join(directory, SOURCE.path);
  fs.writeFileSync(target, "previous view\n"); fs.writeFileSync(source, "frozen source\n");
  try { run({ directory, parent, target, source }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
function noTemporaryFiles(parent) { assert.deepEqual(fs.readdirSync(parent).filter((name) => name.startsWith(".current-decisions.md.")), []); }
function cliWorkspace(run) {
  const temp = mkdtempSync(join(tmpdir(), "zhiwei-view-cli-"));
  const directory = join(temp, "repository");
  try {
    execFileSync("git", ["clone", "--shared", "--quiet", root, directory], { stdio: "pipe" });
    // Exercise this worktree's proposed CLI even before it is committed; history remains real.
    for (const path of ["scripts/check-current-decisions.mjs", "scripts/current-decisions.mjs", "scripts/write-current-decisions-view.mjs"]) fs.copyFileSync(join(root, path), join(directory, path));
    const target = join(directory, VIEW_PATH); const source = join(directory, SOURCE.path);
    const before = fs.readFileSync(source);
    const execute = () => spawnSync(process.execPath, ["scripts/check-current-decisions.mjs", "--write-view"], { cwd: directory, encoding: "utf8" });
    run({ directory, target, source, before, execute });
    assert.deepEqual(fs.readFileSync(source), before, "CLI must preserve frozen source bytes on success or failure");
    noTemporaryFiles(join(directory, "docs/planning"));
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
for (const [name, setUp] of [
  ["source symlink", ({ target }) => { fs.unlinkSync(target); fs.symlinkSync("work-packages.json", target); }],
  ["dangling symlink", ({ target }) => { fs.unlinkSync(target); fs.symlinkSync("missing-source.json", target); }],
  ["source hard link", ({ target, source }) => { fs.unlinkSync(target); fs.linkSync(source, target); }],
  ["directory target", ({ target }) => { fs.unlinkSync(target); fs.mkdirSync(target); }],
]) {
  test(`real CLI refuses ${name} without modifying frozen source or reporting success`, () => cliWorkspace((f) => {
    setUp(f); const result = f.execute();
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.ok(!result.stdout.includes("Original source/checker bytes preserved."));
    assert.match(result.stderr, /Unsafe output target|hard link/);
  }));
}
test("real CLI refuses linked parent directory and preserves source", () => cliWorkspace((f) => {
  const parent = join(f.directory, "docs/planning"); const moved = join(f.directory, "docs/planning-original");
  fs.renameSync(parent, moved); fs.symlinkSync("planning-original", parent);
  const result = f.execute(); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink|Unsafe output parent/);
  assert.ok(!result.stdout.includes("Original source/checker bytes preserved."));
}));
test("real CLI atomically creates missing view and regenerates an existing regular view", () => cliWorkspace((f) => {
  fs.unlinkSync(f.target);
  const expected = renderCurrentDecisions(JSON.parse(fs.readFileSync(join(f.directory, OVERLAY_PATH), "utf8")));
  let result = f.execute(); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(f.target, "utf8"), expected);
  const oldInode = fs.lstatSync(f.target).ino;
  result = f.execute(); assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(f.target, "utf8"), expected);
  assert.notEqual(fs.lstatSync(f.target).ino, oldInode, "Regeneration must replace instead of truncating old inode");
}));
for (const failurePoint of ["writeFileSync", "fsyncSync", "renameSync"]) {
  test(`safe generator preserves old view and cleans staged file on ${failurePoint} failure`, () => viewWorkspace((f) => {
    const viewBefore = fs.readFileSync(f.target); const sourceBefore = fs.readFileSync(f.source);
    const io = { ...fs, [failurePoint]: (...args) => {
      if (failurePoint === "writeFileSync") fs.writeFileSync(args[0], "partial staged output");
      throw new Error(`Synthetic ${failurePoint} failure`);
    } };
    assert.throws(() => writeCurrentDecisionsView(f.directory, "new view\n", io), new RegExp(`Synthetic ${failurePoint} failure`));
    assert.deepEqual(fs.readFileSync(f.target), viewBefore);
    assert.deepEqual(fs.readFileSync(f.source), sourceBefore); noTemporaryFiles(f.parent);
  }));
}
test("safe generator rejects linked parent without staging any write", () => viewWorkspace((f) => {
  const moved = join(f.directory, "original-planning");
  fs.renameSync(f.parent, moved); fs.symlinkSync(moved, f.parent);
  assert.throws(() => writeCurrentDecisionsView(f.directory, "new view\n"), /Unsafe output parent/);
  assert.equal(fs.readFileSync(f.target, "utf8"), "previous view\n"); noTemporaryFiles(moved);
}));
test("safe generator uses exclusive no-follow creation and never opens existing view for writing", () => viewWorkspace((f) => {
  let opens = 0;
  writeCurrentDecisionsView(f.directory, "new view\n", { ...fs, openSync: (path, flags, mode) => {
    opens++; assert.notEqual(path, f.target);
    assert.equal(flags & fs.constants.O_NOFOLLOW, fs.constants.O_NOFOLLOW);
    assert.equal(flags & fs.constants.O_EXCL, fs.constants.O_EXCL);
    return fs.openSync(path, flags, mode);
  } });
  assert.equal(opens, 1); assert.equal(fs.readFileSync(f.target, "utf8"), "new view\n"); noTemporaryFiles(f.parent);
}));
test("safe generator detects concurrent destination replacement and preserves the competing view", () => viewWorkspace((f) => {
  const competing = join(f.parent, "competing.md");
  assert.throws(() => writeCurrentDecisionsView(f.directory, "new view\n", { ...fs, fsyncSync: (fd) => {
    fs.fsyncSync(fd); fs.writeFileSync(competing, "competing view\n"); fs.renameSync(competing, f.target);
  } }), /Output target changed/);
  assert.equal(fs.readFileSync(f.target, "utf8"), "competing view\n"); noTemporaryFiles(f.parent);
}));
test("real CLI rejects input leaf symlink before parsing external contents", () => cliWorkspace((f) => {
  const external = join(dirname(f.directory), "external.json");
  fs.writeFileSync(external, "SYNTHETIC-EXTERNAL-CONTENTS-NOT-TO-BE-PARSED");
  const input = join(f.directory, OVERLAY_PATH); fs.unlinkSync(input); fs.symlinkSync(external, input);
  const result = f.execute(); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink is not an evidence file/);
  assert.ok(!result.stderr.includes("SYNTHETIC-EXTERNAL-CONTENTS-NOT-TO-BE-PARSED"));
  assert.ok(!result.stdout.includes("Original source/checker bytes preserved."));
}));
test("real CLI revalidates written view before reporting successful source preservation", () => cliWorkspace((f) => {
  const probe = join(f.directory, "synthetic-post-rename-probe.mjs");
  fs.writeFileSync(probe, `import fs from "node:fs";\nimport { syncBuiltinESMExports } from "node:module";\nconst original = fs.renameSync;\nfs.renameSync = (from, to) => { original(from, to); if (String(to).endsWith("current-decisions.md")) fs.writeFileSync(to, "synthetic interrupted output\\n"); };\nsyncBuiltinESMExports();\n`);
  const result = spawnSync(process.execPath, ["--import", probe, "scripts/check-current-decisions.mjs", "--write-view"], { cwd: f.directory, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Generated current decision register drift/);
  assert.ok(!result.stdout.includes("Original source/checker bytes preserved."));
}));
