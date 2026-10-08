import assert from 'node:assert/strict';
import test from 'node:test';
import type * as PiSdk from '@earendil-works/pi-coding-agent';

// This is a compile-time compatibility contract, not a production SDK host.
// Referencing the published root checks its entire declaration graph.
type Surface = typeof PiSdk;
type RequiredFactory = Surface['createAgentSession'];
type RequiredRuntimeFactory = Surface['createAgentSessionRuntime'];
type RequiredSessionManager = Surface['SessionManager']['inMemory'];
type RequiredModelRuntime = Surface['ModelRuntime']['create'];
type RequiredSubscription = PiSdk.AgentSession['subscribe'];
type RequiredPrompt = PiSdk.AgentSession['prompt'];
type RequiredEvent = PiSdk.AgentSessionEvent;
type FunctionContract = (...args: never[]) => unknown;
type AssertFunction<T extends FunctionContract> = T;
export type PublishedPiContract = {
  session: AssertFunction<RequiredFactory>;
  runtime: AssertFunction<RequiredRuntimeFactory>;
  memory: AssertFunction<RequiredSessionManager>;
  model: AssertFunction<RequiredModelRuntime>;
  subscription: AssertFunction<RequiredSubscription>;
  prompt: AssertFunction<RequiredPrompt>;
};

const getState = { id: 'g3a-synthetic-state', type: 'get_state' } satisfies PiSdk.RpcCommand;
const settled = { type: 'agent_settled' } satisfies RequiredEvent;
const options = { sessionManager: undefined } satisfies PiSdk.CreateAgentSessionOptions;

test('published Pi types cover the existing SDK/RPC surface without starting a session', () => {
  assert.equal(getState.type, 'get_state');
  assert.equal(settled.type, 'agent_settled');
  assert.equal(options.sessionManager, undefined);
});
