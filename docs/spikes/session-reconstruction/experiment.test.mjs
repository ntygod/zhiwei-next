import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalJsonV1 } from "../../../packages/protocol/src/index.ts";
import { assembleSyntheticInput, createSyntheticContentStore, createSyntheticRevisionStore,
  reconstructSyntheticInput, runSyntheticExperiment, syntheticRevision } from "./experiment.mjs";

const nativeHash = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const nativeRequestHash = (value) => nativeHash(canonicalJsonV1(value));
const clone = (value) => structuredClone(value);
function fixture(downstream = { runtime: "absent-in-fixture", provider: "absent-in-fixture" }) {
  const revisions = createSyntheticRevisionStore(syntheticRevision());
  const contentStore = createSyntheticContentStore();
  const pin = revisions.beginRequest("synthetic-request-1");
  const messages = [{ role: "user", text: " 合成演示：蓝色🟦\r\n第二行\n", storage: "reference" },
    { role: "assistant", text: "合成回复：蓝色。", storage: "inline" },
    { role: "user", text: "", storage: "reference" }];
  const captured = assembleSyntheticInput({ revisions, contentStore, pin, messages, downstream });
  return { ...captured, revisions, contentStore, pin, messages };
}
function reconstruct(context, record = context.record, extra = {}) {
  return reconstructSyntheticInput({ record, revisions: context.revisions,
    resolveReference: context.contentStore.resolve, ...extra });
}

test("mixed bodies and immutable references reconstruct exact ordered UTF-8 input and native SHA-256", () => {
  const context = fixture();
  const result = reconstruct(context, context.record, { requireCompleteFixture: true });
  assert.deepEqual(result.request, context.assembledRequest);
  assert.deepEqual(result.request.messages.map((message) => message.content),
    [syntheticRevision().instruction, ...context.messages.map((message) => message.text)]);
  assert.equal(result.requestSha256, nativeRequestHash(context.assembledRequest));
  for (const component of context.record.components) {
    const text = component.payload.encoding === "inline" ? component.payload.text
      : context.contentStore.resolve(component.payload.reference);
    assert.equal(component.payload.sha256, nativeHash(text));
  }
  assert.equal(result.observedBoundaryComplete, true);
  assert.equal(result.completeWithinDeclaredFixture, true);
  assert.equal(result.realModelInputProven, false);
  assert.equal(result.outputReproductionProven, false);
});

test("identical bodies share a content address without changing occurrences or message order", () => {
  const context = fixture();
  const first = context.contentStore.put("合成重复");
  const second = context.contentStore.put("合成重复");
  assert.deepEqual(first, second);
  assert.equal(context.contentStore.resolve(first.reference), "合成重复");
  const captured = assembleSyntheticInput({ ...context, messages: [
    { role: "user", text: "合成重复", storage: "reference" },
    { role: "assistant", text: "合成重复", storage: "reference" },
  ] });
  assert.equal(captured.record.components[1].payload.reference, captured.record.components[2].payload.reference);
  assert.deepEqual(reconstruct(context, captured.record).request, captured.assembledRequest);
});

test("record survives a JSON round trip without relying on object identity", () => {
  const context = fixture();
  assert.deepEqual(reconstruct(context, JSON.parse(JSON.stringify(context.record))).request, context.assembledRequest);
});

const contentMutations = [
  ["hash-only identifier", (record) => { record.components[1].payload = {
    encoding: "hash-only", sha256: record.components[1].payload.sha256 }; }, /HASH_ONLY_NOT_RECONSTRUCTIBLE/],
  ["missing inline body", (record) => delete record.components[2].payload.text, /exact fixture fields/],
  ["changed inline body", (record) => record.components[2].payload.text += "漂移", /CONTENT_DIGEST_MISMATCH/],
  ["changed inline digest", (record) => record.components[2].payload.sha256 = "0".repeat(64), /CONTENT_DIGEST_MISMATCH/],
  ["non-SHA digest", (record) => record.components[2].payload.sha256 = "summary", /SHA-256 required/],
  ["reference address drift", (record) => record.components[1].payload.reference = `synthetic:sha256:${"0".repeat(64)}`, /CONTENT_ADDRESS_MISMATCH/],
  ["unknown encoding", (record) => record.components[1].payload.encoding = "summary", /UNSUPPORTED_CONTENT_ENCODING/],
  ["out-of-order components", (record) => [record.components[1], record.components[2]] = [record.components[2], record.components[1]], /COMPONENT_ORDER_OR_GAP/],
  ["duplicate ordinal", (record) => record.components[2].ordinal = 1, /COMPONENT_ORDER_OR_GAP/],
  ["missing interior component", (record) => record.components.splice(1, 1), /COMPONENT_ORDER_OR_GAP/],
  ["missing final component", (record) => record.components.pop(), /REQUEST_DIGEST_MISMATCH/],
  ["renumbered reorder", (record) => {
    [record.components[1], record.components[2]] = [record.components[2], record.components[1]];
    record.components.forEach((component, ordinal) => component.ordinal = ordinal);
  }, /REQUEST_DIGEST_MISMATCH/],
  ["role drift", (record) => record.components[1].role = "assistant", /REQUEST_DIGEST_MISMATCH/],
  ["whole-request digest drift", (record) => record.requestSha256 = "0".repeat(64), /REQUEST_DIGEST_MISMATCH/],
  ["unrecognized observation boundary", (record) => record.boundary = "real-provider-input", /synthetic-assembly-output/],
  ["unrecognized fixture version", (record) => record.fixtureVersion = "production-v1", /synthetic-d01-v1/],
  ["memory metadata insertion", (record) => record.memoryClaims = ["synthetic-claim"], /exact fixture fields/],
  ["config instruction replaced with valid digest", (record) => {
    record.components[0].payload.text = "合成被替换配置";
    record.components[0].payload.sha256 = nativeHash(record.components[0].payload.text);
  }, /CONFIG_INSTRUCTION_MISMATCH/],
];
for (const [name, mutate, error] of contentMutations) {
  test(`reconstruction rejects ${name}`, () => {
    const context = fixture();
    const record = clone(context.record);
    mutate(record);
    assert.throws(() => reconstruct(context, record), error);
  });
}

test("missing or deleted reference fails instead of returning a partial body", () => {
  const context = fixture();
  assert.throws(() => reconstruct(context, context.record, { resolveReference: () => undefined }), /REFERENCE_MISSING/);
});
test("reference resolver returning wrong content fails SHA-256 validation", () => {
  const context = fixture();
  assert.throws(() => reconstruct(context, context.record, { resolveReference: () => "合成错误正文" }), /CONTENT_DIGEST_MISMATCH/);
});
test("missing reference resolver does not substitute a digest or summary", () => {
  const context = fixture();
  assert.throws(() => reconstruct(context, context.record, { resolveReference: undefined }), /Reference resolver required/);
});
test("external reference scheme is rejected before invoking the local resolver", () => {
  const context = fixture();
  const record = clone(context.record);
  record.components[1].payload.reference = "https://example.invalid/synthetic-body";
  let calls = 0;
  assert.throws(() => reconstruct(context, record, { resolveReference: () => { calls += 1; } }), /CONTENT_ADDRESS_MISMATCH/);
  assert.equal(calls, 0);
});

for (const stage of ["runtime", "provider"]) {
  for (const state of ["unknown", "unobserved"]) {
    test(`${stage} ${state} allows only observed-boundary reconstruction and rejects complete-fixture claim`, () => {
      const context = fixture({ runtime: "absent-in-fixture", provider: "absent-in-fixture", [stage]: state });
      const result = reconstruct(context);
      assert.deepEqual(result.request, context.assembledRequest);
      assert.equal(result.observedBoundaryComplete, true);
      assert.equal(result.completeWithinDeclaredFixture, false);
      assert.equal(result.realModelInputProven, false);
      assert.deepEqual(result.unproven, [`${stage}:${state}`]);
      assert.throws(() => reconstruct(context, context.record, { requireCompleteFixture: true }), /DOWNSTREAM_UNPROVEN/);
    });
  }
}
test("unrecorded synthetic downstream transform demonstrably differs from reconstructed boundary", () => {
  const context = fixture({ runtime: "unobserved", provider: "unknown" });
  const downstreamRequest = clone(context.assembledRequest);
  downstreamRequest.messages.unshift({ role: "system", content: "合成后续变换，未写入输入记录。" });
  const result = reconstruct(context);
  assert.notDeepEqual(result.request, downstreamRequest);
  assert.notEqual(result.requestSha256, nativeRequestHash(downstreamRequest));
  assert.deepEqual(result.unproven, ["provider:unknown", "runtime:unobserved"]);
  assert.equal(result.completeWithinDeclaredFixture, false);
});
test("missing and unknown downstream statuses fail closed", () => {
  const context = fixture();
  const record = clone(context.record);
  delete record.downstream.provider;
  assert.throws(() => reconstruct(context, record), /exact fixture fields/);
  record.downstream.provider = "probably-observed";
  assert.throws(() => reconstruct(context, record), /Unknown downstream state/);
});
test("omitted downstream declarations default to unknown, never complete", () => {
  const context = fixture();
  const captured = assembleSyntheticInput({ revisions: context.revisions, contentStore: context.contentStore,
    pin: context.pin, messages: context.messages });
  const result = reconstruct(context, captured.record);
  assert.equal(result.completeWithinDeclaredFixture, false);
  assert.deepEqual(result.unproven, ["provider:unknown", "runtime:unknown"]);
});

const configMutations = [
  ["missing nested setting", (revision) => delete revision.parameters.maxOutputTokens, /exact fixture fields/],
  ["invalid nested setting", (revision) => revision.parameters.maxOutputTokens = 0, /Invalid output budget/],
  ["invalid temperature", (revision) => revision.parameters.temperature = 3, /Invalid temperature/],
  ["non-finite setting", (revision) => revision.parameters.temperature = NaN, /finite/],
  ["unknown model", (revision) => revision.model = "real-provider-model", /Unknown synthetic model/],
  ["M2 memory injection", (revision) => revision.memoryMode = "long-term", /must not inject memory/],
  ["unknown override", (revision) => revision.skipValidation = true, /exact fixture fields/],
  ["missing final instruction", (revision) => revision.instruction = "", /nonempty text/],
];
for (const [name, mutate, error] of configMutations) {
  test(`configuration rejects ${name} without polluting later requests`, () => {
    const context = fixture();
    const candidate = syntheticRevision("synthetic-rev-2");
    candidate.model = "synthetic-model-b";
    mutate(candidate);
    assert.throws(() => context.revisions.publish(candidate), error);
    assert.deepEqual(context.revisions.beginRequest(context.pin.requestId), context.pin);
    assert.throws(() => context.revisions.resolve("synthetic-rev-2", "0".repeat(64)), /REVISION_MISSING/);
    const after = assembleSyntheticInput({ ...context, pin: context.revisions.beginRequest("synthetic-after-failure") });
    assert.deepEqual(after.assembledRequest, context.assembledRequest);
  });
}
test("failure after staging a valid revision publishes neither body nor active pointer; retry can succeed", () => {
  const context = fixture();
  const next = syntheticRevision("synthetic-rev-2");
  next.model = "synthetic-model-b";
  next.instruction = "合成新配置：回答虚构形状问题。";
  assert.throws(() => context.revisions.publish(next, { failBeforePublish: true }), /INJECTED_BEFORE_PUBLICATION/);
  assert.deepEqual(context.revisions.beginRequest(context.pin.requestId), context.pin);
  assert.throws(() => context.revisions.resolve(next.revisionId, nativeRequestHash(next)), /REVISION_MISSING/);
  context.revisions.publish(next);
  const pin = context.revisions.beginRequest("synthetic-after-retry");
  assert.equal(pin.revisionId, next.revisionId);
  const after = assembleSyntheticInput({ ...context, pin });
  assert.equal(after.assembledRequest.model, next.model);
  assert.equal(after.assembledRequest.messages[0].content, next.instruction);
});
test("old in-flight pin and saved record remain explainable after a complete new revision publishes", () => {
  const context = fixture();
  const next = syntheticRevision("synthetic-rev-2");
  next.model = "synthetic-model-b";
  next.parameters.temperature = 1;
  next.instruction = "合成新指令。";
  context.revisions.publish(next);
  const oldInFlight = assembleSyntheticInput(context);
  assert.deepEqual(oldInFlight.assembledRequest, context.assembledRequest);
  assert.deepEqual(reconstruct(context).request, context.assembledRequest);
  const newPin = context.revisions.beginRequest("synthetic-request-2");
  const newRequest = assembleSyntheticInput({ ...context, pin: newPin });
  assert.equal(newRequest.assembledRequest.model, next.model);
  assert.notEqual(newRequest.record.requestSha256, context.record.requestSha256);
  assert.equal(reconstruct(context, newRequest.record).revisionId, "synthetic-rev-2");
});
test("publishing an existing revision ID cannot replace historical configuration", () => {
  const context = fixture();
  const overwrite = syntheticRevision();
  overwrite.instruction = "合成覆盖尝试。";
  assert.throws(() => context.revisions.publish(overwrite), /cannot be overwritten/);
  assert.throws(() => context.revisions.publish(syntheticRevision()), /cannot be overwritten/);
  assert.deepEqual(reconstruct(context).request, context.assembledRequest);
});
test("configuration snapshot, pin, record and returned request cannot be changed through aliases", () => {
  const candidate = syntheticRevision();
  const revisions = createSyntheticRevisionStore(candidate);
  const pin = revisions.beginRequest("synthetic-request-1");
  candidate.parameters.temperature = 2;
  const saved = revisions.resolve(pin.revisionId, pin.revisionSha256);
  assert.equal(saved.parameters.temperature, 0);
  assert.throws(() => saved.parameters.temperature = 2, TypeError);
  assert.throws(() => pin.revisionId = "synthetic-rev-2", TypeError);
  const context = fixture();
  assert.throws(() => context.record.components[1].payload.reference = "changed", TypeError);
  assert.throws(() => reconstruct(context).request.messages[0].content = "changed", TypeError);
});
test("revision digest is canonical across object key insertion order", () => {
  const candidate = syntheticRevision();
  const reordered = Object.fromEntries(Object.entries(candidate).reverse());
  reordered.parameters = { maxOutputTokens: 64, temperature: 0 };
  const first = createSyntheticRevisionStore(candidate).beginRequest("synthetic-first");
  const second = createSyntheticRevisionStore(reordered).beginRequest("synthetic-second");
  assert.equal(first.revisionSha256, second.revisionSha256);
  assert.equal(first.revisionSha256, nativeRequestHash(candidate));
});
test("missing historical revision is an error instead of falling back to current configuration", () => {
  const context = fixture();
  const onlyNew = createSyntheticRevisionStore(syntheticRevision("synthetic-rev-2"));
  assert.throws(() => reconstruct(context, context.record, { revisions: onlyNew }), /REVISION_MISSING/);
});
test("mismatching historical revision digest is rejected", () => {
  const context = fixture();
  const record = clone(context.record);
  record.pin.revisionSha256 = "0".repeat(64);
  assert.throws(() => reconstruct(context, record), /REVISION_DIGEST_MISMATCH/);
});
test("request cannot start without a fully published revision", () => {
  assert.throws(() => createSyntheticRevisionStore().beginRequest("synthetic-request"), /No published revision/);
});
test("opt-in command executes fixed synthetic inputs and reports scoped evidence without printing bodies", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types",
    new URL("experiment.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.deepEqual(summary, runSyntheticExperiment());
  assert.equal(summary.fixture, "synthetic-only");
  assert.equal(summary.components, 4);
  assert.equal(summary.realModelInputProven, false);
  assert.equal(summary.outputReproductionProven, false);
  assert.ok(!result.stdout.includes("虚构方块"));
});
test("opt-in command rejects input-file or network-target arguments", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types",
    new URL("experiment.mjs", import.meta.url).pathname, "--input", "synthetic.json"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /accepts no input files or network targets/);
  assert.equal(result.stdout, "");
});
