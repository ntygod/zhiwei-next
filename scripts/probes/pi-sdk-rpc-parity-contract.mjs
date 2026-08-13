export const SDK_RPC_PARITY_SCHEMA_VERSION = 1;
export const SDK_RPC_PARITY_SCENARIO = "sdk-rpc-parity";
export const SDK_RPC_PARITY_EXPECTED_OUTER_CONTRACT_FINGERPRINT =
  "c99bcfb2872736e085750690965dd11dce1bc873b14b905b53a1e57defa3dcbf";
export const SDK_RPC_PARITY_EXPECTED_CAPTURE_CONTRACT_FINGERPRINT =
  "70ce5607549b2d8342d7abba1312b2231c1a069a038dd39a9dbf23dd65ccb9c7";

export const PI_PACKAGE_NAME = "@earendil-works/pi-coding-agent";
export const PI_PACKAGE_VERSION = "0.84.1";
export const PI_PACKAGE_INTEGRITY =
  "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==";
export const PI_PACKAGE_SHASUM = "e098cada629fdeeb9df6e77c6d480d43e1b2c553";
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
  "dist/modes/rpc/rpc-client.d.ts",
  "dist/modes/rpc/rpc-client.js",
  "dist/modes/rpc/rpc-mode.js",
  "dist/modes/rpc/rpc-types.js",
]);

export const SDK_RPC_PARITY_STRUCTURED_SIGNAL_KEYS = Object.freeze([
  "rootIndexReexportsModes",
  "rpcEntryForcesRpcMode",
  "modesIndexExportsRunRpcMode",
  "modesIndexExportsRpcClient",
  "rpcClientUsesStrictJsonlHelpers",
  "rpcClientProcessFieldDeclaredPrivate",
  "rpcClientStopRequestsSigterm",
  "rpcClientStopHasSigkillFallback",
  "rpcModeEmitsPromptResponse",
  "rpcModeExposesSettledEvent",
  "rpcModeExposesStateAndMessages",
  "jsonlUsesLfOnlyBuffering",
]);

export const SDK_RPC_PARITY_REQUIRED_RPC_CLIENT_METHODS = Object.freeze([
  "abort",
  "collectEvents",
  "getAvailableModels",
  "getLastAssistantText",
  "getMessages",
  "getState",
  "getStderr",
  "prompt",
  "setModel",
  "setThinkingLevel",
  "start",
  "stop",
  "waitForIdle",
]);

export const RPC_WORKER_LIFECYCLE_SCHEMA_VERSION = 1;
export const RPC_WORKER_LIFECYCLE_SCENARIO = "rpc-worker-lifecycle";
export const RPC_WORKER_COMMAND_TIMEOUT_MS = 30_000;
export const RPC_WORKER_PROCESS_TIMEOUT_MS = 45_000;
export const RPC_WORKER_NORMAL_PROMPTS = Object.freeze({
  initial: "Record the first fixed RPC worker fact.",
  resumed: "Append the second fixed RPC worker fact after restart.",
});
export const RPC_WORKER_NORMAL_RESPONSES = Object.freeze({
  initial: "First RPC worker response recorded.",
  resumed: "Second RPC worker response recorded after restart.",
});
export const RPC_WORKER_PROVIDER_ERROR_PROMPT =
  "Trigger the fixed accepted RPC provider error.";
export const RPC_WORKER_PROVIDER_ERROR_MESSAGE =
  "ZHIWEI_RPC_FIXED_PROVIDER_ERROR";
export const RPC_WORKER_UNKNOWN_COMMAND_TYPE = "unknown_with_unicode_note";
export const RPC_WORKER_PROVIDER_ID = "zhiwei-rpc-worker-faux";
export const RPC_WORKER_PROVIDER_API_ID = "zhiwei-rpc-worker-faux-api";
export const RPC_WORKER_ERROR_PROVIDER_ID = "zhiwei-rpc-worker-error-faux";
export const RPC_WORKER_ERROR_PROVIDER_API_ID =
  "zhiwei-rpc-worker-error-faux-api";
export const RPC_WORKER_MODEL_ID = "faux-1";
export const RPC_WORKER_MODEL_NAME = "Zhiwei RPC Worker Faux";
export const RPC_WORKER_TOKENS_PER_SECOND = 128;
export const RPC_WORKER_TOKEN_SIZE = 16;
