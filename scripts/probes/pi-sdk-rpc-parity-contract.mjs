export const SDK_RPC_PARITY_SCHEMA_VERSION = 1;
export const SDK_RPC_PARITY_SCENARIO = "sdk-rpc-parity";

export const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";
export const PI_PACKAGE_VERSION = "0.84.1";
export const PI_PACKAGE_INTEGRITY =
  "sha512-XG+bBciNgppI8cRLGPM7EIUm/tE8la/H3zAnyXKB4nyOIced0o005uqTzCF6eX2W/bEyiMh8rt0GVSCf4rtSNQ==";
export const PI_PACKAGE_SHASUM = "0fb7c632055a9797053ef5712a469d7a2e4b2cfb";
export const PI_RELEASE_TAG = "v0.84.1";
export const PI_RELEASE_COMMIT = "53fa77ccd8a279eb87e92294ef3687b03ff80112";

export const SDK_RPC_PARITY_PROMPT =
  "Compare SDK and RPC lifecycle boundaries using the same deterministic response.";
export const SDK_RPC_PARITY_FINAL_TEXT =
  "SDK and RPC lifecycle comparison complete. " +
  "stable-boundary-segment ".repeat(48).trimEnd();

export const SDK_RPC_PARITY_PROVIDER_ID = "zhiwei-sdk-rpc-faux";
export const SDK_RPC_PARITY_API_ID = "zhiwei-sdk-rpc-faux-api";
export const SDK_RPC_PARITY_MODEL_ID = "faux-1";
export const SDK_RPC_PARITY_MODEL_NAME = "Zhiwei SDK RPC Faux";
export const SDK_RPC_PARITY_RESPONSE_ID = "zhiwei-sdk-rpc-response-1";
export const SDK_RPC_PARITY_TOKENS_PER_SECOND = 128;
export const SDK_RPC_PARITY_TOKEN_SIZE = 16;

export const SDK_RPC_PARITY_COMMAND_IDS = Object.freeze({
  availableModels: "models-1",
  setModel: "set-model-1",
  setThinking: "set-thinking-1",
  stateBefore: "state-before-1",
  prompt: "prompt-1",
  stateDuring: "state-during-1",
  messagesAfter: "messages-after-1",
  lastTextAfter: "last-text-after-1",
  stateAfter: "state-after-1",
});

export const SDK_RPC_PARITY_SURFACE_FILES = Object.freeze([
  "dist/index.js",
  "dist/rpc-entry.js",
  "dist/modes/index.js",
  "dist/modes/rpc/jsonl.js",
  "dist/modes/rpc/rpc-client.js",
  "dist/modes/rpc/rpc-mode.js",
  "dist/modes/rpc/rpc-types.js",
]);

export const SDK_RPC_PARITY_REQUIRED_RPC_CLIENT_METHODS = Object.freeze([
  "abort",
  "getAvailableModels",
  "getLastAssistantText",
  "getMessages",
  "getState",
  "prompt",
  "send",
  "setModel",
  "setThinkingLevel",
  "start",
  "stop",
  "waitForIdle",
]);
