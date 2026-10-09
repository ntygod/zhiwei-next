import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SOURCE, OVERLAY_PATH, VIEW_PATH, validateCurrentDecisions, renderCurrentDecisions,
  proposalDigest, sha256, adrContent } from "./current-decisions.mjs";

// Read immutable source text and current ADR bindings once as fixture input.
// Every validation below uses memory maps: no Git, experiment import, subprocess,
// filesystem mutation, network request, or execution of a recorded command.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const baseline = JSON.parse(read(OVERLAY_PATH));
const sourceFiles = new Map([SOURCE.path, SOURCE.checkerPath, SOURCE.registerPath].map((path) => [path, read(path)]));
for (const d of baseline.decisions) for (const adr of d.adrs) {
  sourceFiles.set(adr.path, read(adr.path).replace(/^- 状态：[^\n]+$/m, "- 状态：Proposed"));
}
const bindings = [
  ["D-04", "docs/adr/0014-data-retention-boundary.md"],
  ["D-08", "docs/adr/0015-preintegration-safety-boundary.md"],
];
const entryPoint = "docs/spikes/preintegration-safety/experiment.test.mjs";
const experimentHead = "1".repeat(40);
const reviewHead = "2".repeat(40);
const experimentPr = "https://github.com/ntygod/zhiwei-next/pull/91";
const syntheticReviewPr = "https://github.com/ntygod/zhiwei-next/pull/999";

function fixture(id, status = "Proposed") {
  const data = structuredClone(baseline);
  for (const item of data.decisions) Object.assign(item, {
    status: "Proposed", history: ["Proposed"], proposal: null, evidence: [], decisionReview: null, disposition: null,
  });
  const d = data.decisions.find((item) => item.id === id);
  const files = new Map(sourceFiles);
  const blobs = new Map();
  const blobReads = [];
  const io = {
    read(path) {
      if (path === VIEW_PATH) return renderCurrentDecisions(data);
      assert.ok(files.has(path), `Unexpected fixture read: ${path}`);
      return files.get(path);
    },
    blob(head, path) {
      blobReads.push(`${head}:${path}`);
      assert.ok(blobs.has(`${head}:${path}`), `Unexpected fixture blob: ${head}:${path}`);
      return blobs.get(`${head}:${path}`);
    },
  };
  if (status !== "Proposed") {
    // This text is hashed, never imported or executed. Counts and identities are
    // simulated validator inputs, not observations or approvals for the repository.
    const contents = "synthetic structural fixture; not executable experimental evidence\n";
    files.set(entryPoint, contents);
    blobs.set(`${experimentHead}:${entryPoint}`, contents);
    d.status = "Evidence Ready"; d.history.push("Evidence Ready");
    d.proposal = { selection: "synthetic choice", scope: ["validator shape only"],
      nonGuarantees: ["not real evidence or approval"], remainingGates: ["actual permitted experimental validation and independent decision review"] };
    d.evidence = [{ sourcePr: experimentPr, head: experimentHead, observedAt: "2026-10-09T00:00:00Z", node: "22.23.1",
      files: [{ path: entryPoint, sha256: sha256(contents) }],
      runs: [{ command: `node --experimental-strip-types --test ${entryPoint}`, entryPoint,
        result: { exitCode: 0, tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0 } }] }];
  }
  if (status === "Accepted") {
    blobs.set(`${reviewHead}:${OVERLAY_PATH}`, JSON.stringify(data));
    for (const path of [SOURCE.path, SOURCE.checkerPath, SOURCE.registerPath, entryPoint, ...d.adrs.map((adr) => adr.path)]) {
      blobs.set(`${reviewHead}:${path}`, files.get(path));
    }
    d.status = "Accepted"; d.history.push("Accepted");
    for (const adr of d.adrs) files.set(adr.path, files.get(adr.path).replace("- 状态：Proposed\n", "- 状态：Accepted\n"));
    d.decisionReview = { purpose: "decision-accepted", decisionId: id, primaryPr: syntheticReviewPr,
      evidenceHead: reviewHead, reviewedHead: reviewHead, reviewUrl: `${syntheticReviewPr}#issuecomment-123456789`,
      proposalSha256: proposalDigest(d), observedAt: "2026-10-09T01:00:00Z" };
  }
  return { data, d, files, blobs, blobReads, io };
}

for (const [id, adrPath] of bindings) {
  const rejects = (name, mutate, error, status = "Proposed") => test(`${id} preparation: ${name}`, () => {
    const f = fixture(id, status); mutate(f); assert.throws(() => validateCurrentDecisions(f.data, f.io), error);
  });
  test(`${id} preparation: committed record stays Proposed without evidence or approval`, () => {
    const d = baseline.decisions.find((item) => item.id === id);
    assert.equal(d.status, "Proposed"); assert.deepEqual(d.history, ["Proposed"]);
    assert.equal(d.proposal, null); assert.deepEqual(d.evidence, []);
    assert.equal(d.decisionReview, null); assert.equal(d.disposition, null);
    assert.deepEqual(d.adrs.map((adr) => adr.path), [adrPath]);
    assert.equal(d.adrs[0].sha256, sha256(adrContent(sourceFiles.get(adrPath))));
  });
  test(`${id} preparation: Proposed ADR binding needs no experimental blob`, () => {
    const f = fixture(id); const result = validateCurrentDecisions(f.data, f.io);
    assert.deepEqual(f.blobReads, []); assert.deepEqual(result.accepted, []);
    assert.equal(result.githubApprovalAuthenticated, false);
    assert.equal(result.stageCompletionEvaluated, false);
    assert.equal(result.currentProductApplicabilityEvaluated, false);
  });
  test(`${id} preparation: memory-only evidence shape requires its exact shared entry`, () => {
    const f = fixture(id, "Evidence Ready"); const result = validateCurrentDecisions(f.data, f.io);
    assert.deepEqual(result.accepted, []); assert.equal(f.d.decisionReview, null);
    assert.equal(result.githubApprovalAuthenticated, false); assert.equal(result.stageCompletionEvaluated, false);
    assert.ok(f.blobReads.includes(`${experimentHead}:${entryPoint}`));
  });
  rejects("missing ADR", (f) => f.d.adrs = [], /Decision\/ADR ownership/);
  rejects("other decision ADR cannot substitute", (f) => f.d.adrs = structuredClone(f.data.decisions.find((d) => d.id === (id === "D-04" ? "D-08" : "D-04")).adrs), /Decision\/ADR ownership/);
  rejects("additional ADR cannot expand ownership", (f) => f.d.adrs.push(structuredClone(f.data.decisions[0].adrs[0])), /Decision\/ADR ownership/);
  rejects("ADR body drift", (f) => f.files.set(adrPath, f.files.get(adrPath) + "unreviewed text\n"), /ADR content drift/);
  rejects("ADR status cannot claim acceptance", (f) => f.files.set(adrPath, f.files.get(adrPath).replace("- 状态：Proposed\n", "- 状态：Accepted\n")), /ADR\/current status drift/);
  rejects("Proposed cannot carry evidence", (f) => f.d.evidence = fixture(id, "Evidence Ready").d.evidence, /Expected values/);
  rejects("Proposed cannot carry a decision choice", (f) => f.d.proposal = fixture(id, "Evidence Ready").d.proposal, /Expected values/);
  rejects("Proposed cannot claim decision review", (f) => f.d.decisionReview = fixture(id, "Accepted").d.decisionReview, /Unaccepted proposal/);
  rejects("direct acceptance is illegal", (f) => { f.d.status = "Accepted"; f.d.history.push("Accepted"); }, /Illegal decision transition/);
  rejects("evidence-ready still requires experiments", (f) => f.d.evidence = [], /experimental evidence/, "Evidence Ready");
  rejects("hashed file alone is not a run of the required entry", (f) => {
    const e = f.d.evidence[0], path = "scripts/toolchain.test.mjs", content = "unrelated synthetic fixture\n";
    e.files.push({ path, sha256: sha256(content) }); f.files.set(path, content); f.blobs.set(`${experimentHead}:${path}`, content);
    e.runs[0].entryPoint = path; e.runs[0].command = `node --experimental-strip-types --test ${path}`;
  }, /decision-specific experimental path/, "Evidence Ready");
  rejects("near-matching entry name is rejected", (f) => {
    const e = f.d.evidence[0], path = "docs/spikes/preintegration-safety/other.test.mjs", content = f.files.get(entryPoint);
    e.files[0].path = path; f.files.set(path, content); f.blobs.set(`${experimentHead}:${path}`, content);
    e.runs[0].entryPoint = path; e.runs[0].command = `node --experimental-strip-types --test ${path}`;
  }, /decision-specific experimental path/, "Evidence Ready");
  rejects("historical content remains required", (f) => f.blobs.set(`${experimentHead}:${entryPoint}`, "drift"), /historical evidence blob drift/, "Evidence Ready");
  rejects("current candidate content remains required", (f) => f.files.set(entryPoint, "drift"), /current evidence file drift/, "Evidence Ready");
  test(`${id} preparation: simulated terminal review remains untrusted local structure`, () => {
    const f = fixture(id, "Accepted"); const result = validateCurrentDecisions(f.data, f.io);
    assert.deepEqual(result.accepted, [id]); assert.equal(result.githubApprovalAuthenticated, false);
    assert.equal(result.stageCompletionEvaluated, false); assert.equal(result.currentProductApplicabilityEvaluated, false);
  });
  rejects("experiment PR91 cannot accept the decision", (f) => {
    f.d.decisionReview.primaryPr = experimentPr;
    f.d.decisionReview.reviewUrl = `${experimentPr}#issuecomment-123456789`;
  }, /Experiment PR cannot/, "Accepted");
  rejects("approval for another decision is rejected", (f) => f.d.decisionReview.decisionId = id === "D-04" ? "D-08" : "D-04", /another decision/, "Accepted");
  rejects("reviewed candidate must contain the recorded experimental bytes", (f) => f.blobs.set(`${reviewHead}:${entryPoint}`, "drift"), /reviewed-HEAD evidence file drift/, "Accepted");
  rejects("G2 completion cannot be attached to the overlay", (f) => f.data.g2Complete = true, /unknown fields/);
}
