import assert from 'node:assert/strict';
import test from 'node:test';
import type * as PiClient from '@earendil-works/pi-coding-agent/client';

// G-3a supports this published type subpath only. The root SDK declaration
// graph has documented upstream errors; no production embedding is selected.
type Surface = typeof PiClient;
type FunctionContract = (...args: never[]) => unknown;
type AssertFunction<T extends FunctionContract> = T;
export type PublishedPiClientContract = {
  open: AssertFunction<Surface['RemoteSession']['open']>;
  create: AssertFunction<Surface['RemoteSession']['create']>;
  subscribe: AssertFunction<PiClient.RemoteSession['subscribe']>;
  submit: AssertFunction<PiClient.RemoteSession['submit']>;
  abort: AssertFunction<PiClient.RemoteSession['abort']>;
  reconnect: AssertFunction<PiClient.RemoteSession['reconnect']>;
  dispose: AssertFunction<PiClient.RemoteSession['dispose']>;
  snapshot: AssertFunction<Surface['applyTranscriptSnapshot']>;
  progress: AssertFunction<Surface['applyTranscriptProgress']>;
};

const creating = { status: 'busy', operation: 'create' } satisfies PiClient.RemoteSessionLifecycle;
const options = { cwd: '/synthetic/unused', thinkingLevel: 'off' } satisfies PiClient.CreateRemoteSessionOptions;
const emptyState = { lifecycle: { status: 'unbound' }, transcript: [] } satisfies PiClient.RemoteSessionState;
const prompt: Parameters<PiClient.RemoteSession['submit']>[0] = 'synthetic-not-sent';

test('published Pi client types cover session lifecycle and submission without executing Pi', () => {
  assert.equal(creating.operation, 'create');
  assert.equal(options.thinkingLevel, 'off');
  assert.equal(emptyState.lifecycle.status, 'unbound');
  assert.equal(prompt, 'synthetic-not-sent');
});
