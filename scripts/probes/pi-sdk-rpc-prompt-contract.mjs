export const SDK_RPC_PROMPT_SCHEMA_VERSION = 1;
export const SDK_RPC_PROMPT_SCENARIO = "sdk-rpc-prompt";

export const SDK_RPC_PROMPT_TEXT =
  "Compare SDK and RPC lifecycle boundaries using the same deterministic response.";
export const SDK_RPC_FINAL_TEXT =
  "SDK and RPC lifecycle comparison complete. " + "stable-boundary-segment ".repeat(48).trimEnd();

export const SDK_RPC_PROVIDER_ID = "zhiwei-sdk-rpc-faux";
export const SDK_RPC_API_ID = "zhiwei-sdk-rpc-faux-api";
export const SDK_RPC_MODEL_ID = "faux-1";
export const SDK_RPC_MODEL_NAME = "Zhiwei SDK RPC Faux";
export const SDK_RPC_RESPONSE_ID = "zhiwei-sdk-rpc-response-1";
export const SDK_RPC_TOKENS_PER_SECOND = 128;
export const SDK_RPC_TOKEN_SIZE = 16;

export const SDK_RPC_COMMAND_IDS = Object.freeze({
  availableModels: "models-1",
  setModel: "set-model-1",
  setThinking: "set-thinking-1",
  stateBefore: "state-before-1",
  prompt: "prompt-1",
  stateDuring: "state-during-1",
  stateAfter: "state-after-1",
  messagesAfter: "messages-after-1",
  lastTextAfter: "last-text-after-1",
});
