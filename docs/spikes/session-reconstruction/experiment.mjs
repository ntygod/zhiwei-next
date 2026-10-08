// Opt-in, in-memory synthetic D-01 experiment. Never imported by product code.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJsonV1, sha256HexUtf8 } from "../../../packages/protocol/src/index.ts";

const digest = (value) => sha256HexUtf8(canonicalJsonV1(value));
const copy = (value) => JSON.parse(canonicalJsonV1(value));
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function fields(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label}: object required`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: exact fixture fields required`);
}
function nonempty(value, label) {
  assert.ok(typeof value === "string" && value.length > 0, `${label}: nonempty text required`);
}
function hash(value, label) {
  assert.ok(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), `${label}: SHA-256 required`);
}

export function syntheticRevision(revisionId = "synthetic-rev-1") {
  return { revisionId, fixture: "synthetic-only", memoryMode: "none", model: "synthetic-model-a",
    parameters: { temperature: 0, maxOutputTokens: 64 }, instruction: "合成演示：仅回答虚构颜色问题。" };
}

// This is a local fixture shape, not a SessionContract or a second protocol validator.
function validatedRevision(candidate) {
  const revision = copy(candidate); // Existing public protocol rejects non-lossless JSON.
  fields(revision, ["revisionId", "fixture", "memoryMode", "model", "parameters", "instruction"], "revision");
  assert.match(revision.revisionId, /^synthetic-rev-[1-9][0-9]*$/, "Synthetic revision ID required");
  assert.equal(revision.fixture, "synthetic-only");
  assert.equal(revision.memoryMode, "none", "M0 fixture must not inject memory");
  assert.ok(["synthetic-model-a", "synthetic-model-b"].includes(revision.model), "Unknown synthetic model");
  fields(revision.parameters, ["temperature", "maxOutputTokens"], "parameters");
  assert.ok(typeof revision.parameters.temperature === "number" && revision.parameters.temperature >= 0
    && revision.parameters.temperature <= 2, "Invalid temperature");
  assert.ok(Number.isSafeInteger(revision.parameters.maxOutputTokens) && revision.parameters.maxOutputTokens > 0
    && revision.parameters.maxOutputTokens <= 4096, "Invalid output budget");
  nonempty(revision.instruction, "instruction");
  return freeze({ revision, sha256: digest(revision) });
}

export function createSyntheticRevisionStore(initial) {
  let state = { current: undefined, revisions: new Map() };
  const api = {
    publish(candidate, { failBeforePublish = false } = {}) {
      assert.equal(typeof failBeforePublish, "boolean");
      const entry = validatedRevision(candidate);
      const id = entry.revision.revisionId;
      assert.ok(!state.revisions.has(id), "Revision ID cannot be overwritten");
      const revisions = new Map(state.revisions);
      revisions.set(id, entry); // Staged copy, not visible to requests.
      if (failBeforePublish) throw new Error("INJECTED_BEFORE_PUBLICATION");
      state = { current: id, revisions }; // Single synchronous in-memory publication.
      return entry;
    },
    beginRequest(requestId) {
      nonempty(requestId, "requestId");
      assert.ok(state.current, "No published revision");
      const entry = state.revisions.get(state.current);
      return freeze({ requestId, revisionId: state.current, revisionSha256: entry.sha256 });
    },
    resolve(revisionId, expectedSha256) {
      const entry = state.revisions.get(revisionId);
      assert.ok(entry, "REVISION_MISSING");
      assert.equal(entry.sha256, expectedSha256, "REVISION_DIGEST_MISMATCH");
      return entry.revision;
    },
  };
  if (initial !== undefined) api.publish(initial);
  return Object.freeze(api);
}

// Immutable strings and content-addressed keys only; no filesystem or remote resolver.
export function createSyntheticContentStore() {
  const bodies = new Map();
  return Object.freeze({
    put(text) {
      assert.equal(typeof text, "string");
      const sha256 = sha256HexUtf8(text);
      const reference = `synthetic:sha256:${sha256}`;
      if (bodies.has(reference)) assert.equal(bodies.get(reference), text, "CONTENT_ADDRESS_CONFLICT");
      bodies.set(reference, text);
      return freeze({ encoding: "reference", reference, sha256 });
    },
    resolve(reference) { return bodies.get(reference); },
  });
}

function downstreamStates(states) {
  fields(states, ["runtime", "provider"], "downstream");
  for (const value of Object.values(states)) {
    assert.ok(["absent-in-fixture", "unknown", "unobserved"].includes(value), "Unknown downstream state");
  }
}

export function assembleSyntheticInput({ revisions, pin, contentStore, messages,
  downstream = { runtime: "unknown", provider: "unknown" } }) {
  const requestPin = copy(pin);
  fields(requestPin, ["requestId", "revisionId", "revisionSha256"], "request pin");
  nonempty(requestPin.requestId, "requestId");
  const revision = revisions.resolve(requestPin.revisionId, requestPin.revisionSha256);
  const states = copy(downstream);
  downstreamStates(states);
  assert.ok(Array.isArray(messages) && messages.length > 0, "Synthetic messages required");
  const fragments = [{ role: "system", text: revision.instruction, storage: "inline", origin: "config-revision" }];
  for (const value of messages) {
    const message = copy(value);
    fields(message, ["role", "text", "storage"], "synthetic message");
    assert.ok(["user", "assistant"].includes(message.role), "Unsupported fixture role");
    assert.equal(typeof message.text, "string");
    assert.ok(["inline", "reference"].includes(message.storage), "Unsupported fixture storage");
    fragments.push({ ...message, origin: "synthetic-fixture" });
  }
  // This object is actually assembled here. There is no Pi, model or network call.
  const request = { model: revision.model, parameters: revision.parameters,
    messages: fragments.map(({ role, text }) => ({ role, content: text })) };
  const components = fragments.map(({ role, text, storage, origin }, ordinal) => ({ ordinal, role, origin,
    payload: storage === "reference" ? contentStore.put(text)
      : { encoding: "inline", text, sha256: sha256HexUtf8(text) } }));
  const record = freeze({ fixtureVersion: "synthetic-d01-v1", boundary: "synthetic-assembly-output",
    pin: requestPin, downstream: states, components, requestSha256: digest(request) });
  return { record, assembledRequest: freeze(copy(request)) };
}

export function reconstructSyntheticInput({ record, revisions, resolveReference, requireCompleteFixture = false }) {
  const saved = copy(record);
  fields(saved, ["fixtureVersion", "boundary", "pin", "downstream", "components", "requestSha256"], "record");
  assert.equal(saved.fixtureVersion, "synthetic-d01-v1");
  assert.equal(saved.boundary, "synthetic-assembly-output");
  fields(saved.pin, ["requestId", "revisionId", "revisionSha256"], "request pin");
  nonempty(saved.pin.requestId, "requestId");
  hash(saved.pin.revisionSha256, "revision digest");
  const revision = revisions.resolve(saved.pin.revisionId, saved.pin.revisionSha256);
  downstreamStates(saved.downstream);
  assert.ok(Array.isArray(saved.components) && saved.components.length >= 2, "Missing ordered components");
  const messages = saved.components.map((component, index) => {
    fields(component, ["ordinal", "role", "origin", "payload"], "component");
    assert.equal(component.ordinal, index, "COMPONENT_ORDER_OR_GAP");
    assert.equal(component.origin, index === 0 ? "config-revision" : "synthetic-fixture", "Unknown component origin");
    assert.ok(index === 0 ? component.role === "system" : ["user", "assistant"].includes(component.role), "Unexpected role");
    const payload = component.payload;
    assert.ok(payload && typeof payload === "object", "Missing content payload");
    if (payload.encoding === "hash-only") throw new Error("HASH_ONLY_NOT_RECONSTRUCTIBLE");
    let text;
    if (payload.encoding === "inline") {
      fields(payload, ["encoding", "text", "sha256"], "inline payload");
      text = payload.text;
      assert.equal(typeof text, "string", "Missing inline body");
    } else if (payload.encoding === "reference") {
      fields(payload, ["encoding", "reference", "sha256"], "reference payload");
      assert.equal(payload.reference, `synthetic:sha256:${payload.sha256}`, "CONTENT_ADDRESS_MISMATCH");
      assert.equal(typeof resolveReference, "function", "Reference resolver required");
      text = resolveReference(payload.reference);
      assert.ok(typeof text === "string", "REFERENCE_MISSING");
    } else throw new Error("UNSUPPORTED_CONTENT_ENCODING");
    hash(payload.sha256, "content digest");
    assert.equal(sha256HexUtf8(text), payload.sha256, "CONTENT_DIGEST_MISMATCH");
    if (index === 0) assert.equal(text, revision.instruction, "CONFIG_INSTRUCTION_MISMATCH");
    return { role: component.role, content: text };
  });
  const request = { model: revision.model, parameters: revision.parameters, messages };
  hash(saved.requestSha256, "request digest");
  assert.equal(digest(request), saved.requestSha256, "REQUEST_DIGEST_MISMATCH");
  const unproven = Object.entries(saved.downstream).filter(([, state]) => state !== "absent-in-fixture")
    .map(([stage, state]) => `${stage}:${state}`);
  assert.equal(typeof requireCompleteFixture, "boolean");
  if (requireCompleteFixture && unproven.length) throw new Error(`DOWNSTREAM_UNPROVEN: ${unproven.join(",")}`);
  return freeze({ request, requestSha256: saved.requestSha256, revisionId: revision.revisionId,
    observedBoundaryComplete: true, completeWithinDeclaredFixture: unproven.length === 0,
    realModelInputProven: false, outputReproductionProven: false, unproven });
}

export function runSyntheticExperiment() {
  const revisions = createSyntheticRevisionStore(syntheticRevision());
  const contentStore = createSyntheticContentStore();
  const pin = revisions.beginRequest("synthetic-request-1");
  const { record, assembledRequest } = assembleSyntheticInput({ revisions, pin, contentStore,
    downstream: { runtime: "absent-in-fixture", provider: "absent-in-fixture" },
    messages: [{ role: "user", text: "合成问题：虚构方块是什么颜色？\n", storage: "reference" },
      { role: "assistant", text: "合成回答：蓝色。", storage: "inline" },
      { role: "user", text: "合成追问：请重复颜色。", storage: "reference" }] });
  const result = reconstructSyntheticInput({ record, revisions, resolveReference: contentStore.resolve,
    requireCompleteFixture: true });
  assert.deepEqual(result.request, assembledRequest);
  return { fixture: "synthetic-only", boundary: record.boundary, components: record.components.length,
    requestSha256: result.requestSha256, observedBoundaryComplete: result.observedBoundaryComplete,
    completeWithinDeclaredFixture: result.completeWithinDeclaredFixture,
    realModelInputProven: result.realModelInputProven, outputReproductionProven: result.outputReproductionProven };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, "This experiment accepts no input files or network targets");
  console.log(JSON.stringify(runSyntheticExperiment(), null, 2));
}
