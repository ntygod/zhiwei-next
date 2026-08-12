import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_FIXTURE = "packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json";
const inputPath = resolve(
  process.argv[2] ?? process.env.PI_COMPACTION_SESSION_REPLACEMENT_OUTPUT ?? DEFAULT_FIXTURE,
);
const violations = [];

const EXPECTED_OUTER_FINGERPRINT = "9ebe87b12f0670214fa1244239d21d7a517b2332da2f3f85b3372b8b6895ab75";
const EXPECTED_CAPTURE_FINGERPRINT = "f4e3d675207416c961585ee645c5fc43c395320ed7a736da71bae741577b1fee";
const EXPECTED_RESULT_SHA256 = "b5d4f92399531ad7eedfebfe2b6f7fa80fe0dfdface6b0a886bd4cbef29d3b03";
const EXPECTED_MANUAL_COMPACTION = {
  "prompts": [
    "Remember the first fixed compaction fact.",
    "Remember the second fixed compaction fact."
  ],
  "responses": [
    "First compaction response recorded.",
    "Second compaction response recorded."
  ],
  "summary": "Verified extension summary.\n- First fixed compaction fact was recorded.\n- Second fixed compaction fact remains the recent turn.",
  "summaryUsage": {
    "input": 11,
    "output": 7,
    "cacheRead": 3,
    "cacheWrite": 2,
    "totalTokens": 23,
    "cost": {
      "input": 0.11,
      "output": 0.07,
      "cacheRead": 0.03,
      "cacheWrite": 0.02,
      "total": 0.23
    }
  },
  "provider": {
    "id": "zhiwei-compaction-faux",
    "api": "zhiwei-compaction-faux-api",
    "callsBeforeCompact": 2,
    "callsAfterCompact": 2,
    "pendingBeforeCompact": 1,
    "pendingAfterCompact": 1,
    "promptsSentToExternalProvider": 0
  },
  "before": {
    "messages": [
      {
        "index": 0,
        "role": "user",
        "contentKinds": [
          "text"
        ],
        "text": "Remember the first fixed compaction fact."
      },
      {
        "index": 1,
        "role": "assistant",
        "stopReason": "stop",
        "contentKinds": [
          "text"
        ],
        "text": "First compaction response recorded."
      },
      {
        "index": 2,
        "role": "user",
        "contentKinds": [
          "text"
        ],
        "text": "Remember the second fixed compaction fact."
      },
      {
        "index": 3,
        "role": "assistant",
        "stopReason": "stop",
        "contentKinds": [
          "text"
        ],
        "text": "Second compaction response recorded."
      }
    ],
    "entries": [
      {
        "entry": "compaction-entry-1",
        "parent": null,
        "type": "model_change",
        "provider": "zhiwei-compaction-faux",
        "modelId": "faux-1"
      },
      {
        "entry": "compaction-entry-2",
        "parent": "compaction-entry-1",
        "type": "thinking_level_change",
        "thinkingLevel": "off"
      },
      {
        "entry": "compaction-entry-3",
        "parent": "compaction-entry-2",
        "type": "message",
        "message": {
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Remember the first fixed compaction fact."
        }
      },
      {
        "entry": "compaction-entry-4",
        "parent": "compaction-entry-3",
        "type": "message",
        "message": {
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "First compaction response recorded."
        }
      },
      {
        "entry": "compaction-entry-5",
        "parent": "compaction-entry-4",
        "type": "message",
        "message": {
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Remember the second fixed compaction fact."
        }
      },
      {
        "entry": "compaction-entry-6",
        "parent": "compaction-entry-5",
        "type": "message",
        "message": {
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "Second compaction response recorded."
        }
      }
    ],
    "entryTypes": [
      "model_change",
      "thinking_level_change",
      "message",
      "message",
      "message",
      "message"
    ],
    "stats": {
      "userMessages": 2,
      "assistantMessages": 2,
      "toolCalls": 0,
      "toolResults": 0,
      "totalMessages": 4,
      "tokens": {
        "input": 472,
        "output": 18,
        "cacheRead": 448,
        "cacheWrite": 472,
        "total": 1410
      },
      "cost": 0
    },
    "isIdle": true,
    "isCompacting": false
  },
  "compactResult": {
    "summary": "Verified extension summary.\n- First fixed compaction fact was recorded.\n- Second fixed compaction fact remains the recent turn.",
    "firstKeptEntry": "compaction-entry-6",
    "tokensBefore": 505,
    "estimatedTokensAfter": 41,
    "usage": {
      "input": 11,
      "output": 7,
      "cacheRead": 3,
      "cacheWrite": 2,
      "totalTokens": 23,
      "cost": {
        "input": 0.11,
        "output": 0.07,
        "cacheRead": 0.03,
        "cacheWrite": 0.02,
        "total": 0.23
      }
    },
    "details": {
      "source": "zhiwei-extension",
      "schemaVersion": 1
    }
  },
  "after": {
    "messages": [
      {
        "index": 0,
        "role": "compactionSummary",
        "summary": "Verified extension summary.\n- First fixed compaction fact was recorded.\n- Second fixed compaction fact remains the recent turn.",
        "tokensBefore": 505
      },
      {
        "index": 1,
        "role": "assistant",
        "stopReason": "stop",
        "contentKinds": [
          "text"
        ],
        "text": "Second compaction response recorded."
      }
    ],
    "entries": [
      {
        "entry": "compaction-entry-1",
        "parent": null,
        "type": "model_change",
        "provider": "zhiwei-compaction-faux",
        "modelId": "faux-1"
      },
      {
        "entry": "compaction-entry-2",
        "parent": "compaction-entry-1",
        "type": "thinking_level_change",
        "thinkingLevel": "off"
      },
      {
        "entry": "compaction-entry-3",
        "parent": "compaction-entry-2",
        "type": "message",
        "message": {
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Remember the first fixed compaction fact."
        }
      },
      {
        "entry": "compaction-entry-4",
        "parent": "compaction-entry-3",
        "type": "message",
        "message": {
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "First compaction response recorded."
        }
      },
      {
        "entry": "compaction-entry-5",
        "parent": "compaction-entry-4",
        "type": "message",
        "message": {
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Remember the second fixed compaction fact."
        }
      },
      {
        "entry": "compaction-entry-6",
        "parent": "compaction-entry-5",
        "type": "message",
        "message": {
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "Second compaction response recorded."
        }
      },
      {
        "entry": "compaction-entry-7",
        "parent": "compaction-entry-6",
        "type": "compaction",
        "summary": "Verified extension summary.\n- First fixed compaction fact was recorded.\n- Second fixed compaction fact remains the recent turn.",
        "firstKeptEntry": "compaction-entry-6",
        "tokensBefore": 505,
        "usage": {
          "input": 11,
          "output": 7,
          "cacheRead": 3,
          "cacheWrite": 2,
          "totalTokens": 23,
          "cost": {
            "input": 0.11,
            "output": 0.07,
            "cacheRead": 0.03,
            "cacheWrite": 0.02,
            "total": 0.23
          }
        },
        "details": {
          "source": "zhiwei-extension",
          "schemaVersion": 1
        }
      }
    ],
    "entryTypes": [
      "model_change",
      "thinking_level_change",
      "message",
      "message",
      "message",
      "message",
      "compaction"
    ],
    "stats": {
      "userMessages": 2,
      "assistantMessages": 2,
      "toolCalls": 0,
      "toolResults": 0,
      "totalMessages": 4,
      "tokens": {
        "input": 483,
        "output": 25,
        "cacheRead": 451,
        "cacheWrite": 474,
        "total": 1433
      },
      "cost": 0.23
    },
    "isIdle": true,
    "isCompacting": false
  },
  "extensionBeforeSnapshot": {
    "branchEntryTypes": [
      "model_change",
      "thinking_level_change",
      "message",
      "message",
      "message",
      "message"
    ],
    "firstKeptEntry": "compaction-entry-6"
  },
  "publicEvents": [
    {
      "sequence": 1,
      "type": "compaction_start",
      "reason": "manual"
    },
    {
      "sequence": 2,
      "type": "compaction_end",
      "reason": "manual",
      "aborted": false,
      "willRetry": false,
      "result": {
        "summary": "Verified extension summary.\n- First fixed compaction fact was recorded.\n- Second fixed compaction fact remains the recent turn.",
        "firstKeptEntry": "compaction-entry-6",
        "tokensBefore": 505,
        "estimatedTokensAfter": 41,
        "usage": {
          "input": 11,
          "output": 7,
          "cacheRead": 3,
          "cacheWrite": 2,
          "totalTokens": 23,
          "cost": {
            "input": 0.11,
            "output": 0.07,
            "cacheRead": 0.03,
            "cacheWrite": 0.02,
            "total": 0.23
          }
        },
        "details": {
          "source": "zhiwei-extension",
          "schemaVersion": 1
        }
      }
    }
  ],
  "extensionEvents": [
    {
      "sequence": 1,
      "type": "session_before_compact",
      "reason": "manual",
      "willRetry": false,
      "firstKeptEntry": "compaction-entry-6",
      "tokensBefore": 505,
      "branchEntryTypes": [
        "model_change",
        "thinking_level_change",
        "message",
        "message",
        "message",
        "message"
      ],
      "branchEntryAliases": [
        "compaction-entry-1",
        "compaction-entry-2",
        "compaction-entry-3",
        "compaction-entry-4",
        "compaction-entry-5",
        "compaction-entry-6"
      ],
      "signalAborted": false
    },
    {
      "sequence": 2,
      "type": "session_compact",
      "reason": "manual",
      "fromExtension": true,
      "compactionEntry": "compaction-entry-7",
      "firstKeptEntry": "compaction-entry-6",
      "summary": "Verified extension summary.\n- First fixed compaction fact was recorded.\n- Second fixed compaction fact remains the recent turn.",
      "tokensBefore": 505,
      "usage": {
        "input": 11,
        "output": 7,
        "cacheRead": 3,
        "cacheWrite": 2,
        "totalTokens": 23,
        "cost": {
          "input": 0.11,
          "output": 0.07,
          "cacheRead": 0.03,
          "cacheWrite": 0.02,
          "total": 0.23
        }
      },
      "details": {
        "source": "zhiwei-extension",
        "schemaVersion": 1
      }
    },
    {
      "sequence": 3,
      "type": "session_shutdown",
      "reason": "exit"
    }
  ],
  "counts": {
    "public": {
      "compaction_end": 1,
      "compaction_start": 1
    },
    "extension": {
      "session_before_compact": 1,
      "session_compact": 1,
      "session_shutdown": 1
    },
    "entriesBefore": 6,
    "entriesAfter": 7,
    "compactionEntriesAfter": 1
  },
  "aliases": {
    "entries": [
      "compaction-entry-1",
      "compaction-entry-2",
      "compaction-entry-3",
      "compaction-entry-4",
      "compaction-entry-5",
      "compaction-entry-6",
      "compaction-entry-7"
    ]
  },
  "lifecycleNotes": [
    {
      "type": "shutdown-host-boundary",
      "mechanism": "session.extensionRunner.emit",
      "reason": "exit"
    }
  ]
};
const EXPECTED_SESSION_REPLACEMENT = {
  "prompts": {
    "original": "Create the original replacement session fact.",
    "fresh": "Create the new replacement session fact.",
    "resumed": "Append a fact after resuming the original session."
  },
  "responses": {
    "original": "Original session response.",
    "fresh": "New session response.",
    "resumed": "Resumed original session response."
  },
  "provider": {
    "id": "zhiwei-session-replacement-faux",
    "api": "zhiwei-session-replacement-faux-api",
    "callCount": 3,
    "pendingResponses": 0,
    "promptsSentToExternalProvider": 0
  },
  "snapshots": {
    "initial": {
      "sessionObject": "session-object-1",
      "sessionFile": "session-file-1",
      "messages": [
        {
          "index": 0,
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Create the original replacement session fact."
        },
        {
          "index": 1,
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "Original session response."
        }
      ],
      "isIdle": true
    },
    "newBeforePrompt": {
      "sessionObject": "session-object-2",
      "sessionFile": "session-file-2",
      "messages": [],
      "isIdle": true
    },
    "newAfterPrompt": {
      "sessionObject": "session-object-2",
      "sessionFile": "session-file-2",
      "messages": [
        {
          "index": 0,
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Create the new replacement session fact."
        },
        {
          "index": 1,
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "New session response."
        }
      ],
      "isIdle": true
    },
    "resumedBeforePrompt": {
      "sessionObject": "session-object-3",
      "sessionFile": "session-file-1",
      "messages": [
        {
          "index": 0,
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Create the original replacement session fact."
        },
        {
          "index": 1,
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "Original session response."
        }
      ],
      "isIdle": true
    },
    "resumedAfterPrompt": {
      "sessionObject": "session-object-3",
      "sessionFile": "session-file-1",
      "messages": [
        {
          "index": 0,
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Create the original replacement session fact."
        },
        {
          "index": 1,
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "Original session response."
        },
        {
          "index": 2,
          "role": "user",
          "contentKinds": [
            "text"
          ],
          "text": "Append a fact after resuming the original session."
        },
        {
          "index": 3,
          "role": "assistant",
          "stopReason": "stop",
          "contentKinds": [
            "text"
          ],
          "text": "Resumed original session response."
        }
      ],
      "isIdle": true
    }
  },
  "operations": {
    "newSession": {
      "cancelled": false
    },
    "switchSession": {
      "cancelled": false
    }
  },
  "extensionEvents": [
    {
      "sequence": 1,
      "type": "session_start",
      "generation": 1,
      "reason": "startup"
    },
    {
      "sequence": 2,
      "type": "input",
      "generation": 1,
      "source": "interactive"
    },
    {
      "sequence": 3,
      "type": "message_end",
      "generation": 1,
      "messageRole": "user",
      "messageText": "Create the original replacement session fact."
    },
    {
      "sequence": 4,
      "type": "message_end",
      "generation": 1,
      "messageRole": "assistant",
      "messageText": "Original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 5,
      "type": "agent_end",
      "generation": 1
    },
    {
      "sequence": 6,
      "type": "agent_settled",
      "generation": 1
    },
    {
      "sequence": 7,
      "type": "session_before_switch",
      "generation": 1,
      "reason": "new"
    },
    {
      "sequence": 8,
      "type": "session_shutdown",
      "generation": 1,
      "reason": "new",
      "targetSessionFile": "session-file-2"
    },
    {
      "sequence": 9,
      "type": "session_start",
      "generation": 2,
      "reason": "new",
      "previousSessionFile": "session-file-1"
    },
    {
      "sequence": 10,
      "type": "input",
      "generation": 2,
      "source": "interactive"
    },
    {
      "sequence": 11,
      "type": "message_end",
      "generation": 2,
      "messageRole": "user",
      "messageText": "Create the new replacement session fact."
    },
    {
      "sequence": 12,
      "type": "message_end",
      "generation": 2,
      "messageRole": "assistant",
      "messageText": "New session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 13,
      "type": "agent_end",
      "generation": 2
    },
    {
      "sequence": 14,
      "type": "agent_settled",
      "generation": 2
    },
    {
      "sequence": 15,
      "type": "session_before_switch",
      "generation": 2,
      "reason": "resume",
      "targetSessionFile": "session-file-1"
    },
    {
      "sequence": 16,
      "type": "session_shutdown",
      "generation": 2,
      "reason": "resume",
      "targetSessionFile": "session-file-1"
    },
    {
      "sequence": 17,
      "type": "session_start",
      "generation": 3,
      "reason": "resume",
      "previousSessionFile": "session-file-2"
    },
    {
      "sequence": 18,
      "type": "input",
      "generation": 3,
      "source": "interactive"
    },
    {
      "sequence": 19,
      "type": "message_end",
      "generation": 3,
      "messageRole": "user",
      "messageText": "Append a fact after resuming the original session."
    },
    {
      "sequence": 20,
      "type": "message_end",
      "generation": 3,
      "messageRole": "assistant",
      "messageText": "Resumed original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 21,
      "type": "agent_end",
      "generation": 3
    },
    {
      "sequence": 22,
      "type": "agent_settled",
      "generation": 3
    },
    {
      "sequence": 23,
      "type": "session_shutdown",
      "generation": 3,
      "reason": "quit"
    }
  ],
  "replacementPhases": [
    {
      "sequence": 1,
      "phase": "initial:bind-extensions:start",
      "sessionObject": "session-object-1",
      "generation": 1
    },
    {
      "sequence": 2,
      "phase": "extension:session_start",
      "generation": 1,
      "reason": "startup",
      "targetSessionFile": null,
      "previousSessionFile": null
    },
    {
      "sequence": 3,
      "phase": "initial:bind-extensions:end",
      "sessionObject": "session-object-1",
      "generation": 1
    },
    {
      "sequence": 4,
      "phase": "public-listener:attach",
      "sessionObject": "session-object-1",
      "bindingReason": "initial"
    },
    {
      "sequence": 5,
      "phase": "extension:session_before_switch",
      "generation": 1,
      "reason": "new",
      "targetSessionFile": null,
      "previousSessionFile": null
    },
    {
      "sequence": 6,
      "phase": "extension:session_shutdown",
      "generation": 1,
      "reason": "new",
      "targetSessionFile": "session-file-2",
      "previousSessionFile": null
    },
    {
      "sequence": 7,
      "phase": "before-session-invalidate",
      "sessionObject": "session-object-1",
      "sessionFile": "session-file-1"
    },
    {
      "sequence": 8,
      "phase": "rebind-session:start",
      "sessionObject": "session-object-2",
      "sessionFile": "session-file-2",
      "generation": 2
    },
    {
      "sequence": 9,
      "phase": "extension:session_start",
      "generation": 2,
      "reason": "new",
      "targetSessionFile": null,
      "previousSessionFile": "session-file-1"
    },
    {
      "sequence": 10,
      "phase": "rebind-session:extensions-bound",
      "sessionObject": "session-object-2",
      "generation": 2
    },
    {
      "sequence": 11,
      "phase": "public-listener:attach",
      "sessionObject": "session-object-2",
      "bindingReason": "replacement"
    },
    {
      "sequence": 12,
      "phase": "rebind-session:end",
      "sessionObject": "session-object-2",
      "generation": 2
    },
    {
      "sequence": 13,
      "phase": "with-session:new",
      "sessionObject": "session-object-2",
      "sessionFile": "session-file-2",
      "cwdMatches": true,
      "isIdle": true
    },
    {
      "sequence": 14,
      "phase": "extension:session_before_switch",
      "generation": 2,
      "reason": "resume",
      "targetSessionFile": "session-file-1",
      "previousSessionFile": null
    },
    {
      "sequence": 15,
      "phase": "extension:session_shutdown",
      "generation": 2,
      "reason": "resume",
      "targetSessionFile": "session-file-1",
      "previousSessionFile": null
    },
    {
      "sequence": 16,
      "phase": "before-session-invalidate",
      "sessionObject": "session-object-2",
      "sessionFile": "session-file-2"
    },
    {
      "sequence": 17,
      "phase": "rebind-session:start",
      "sessionObject": "session-object-3",
      "sessionFile": "session-file-1",
      "generation": 3
    },
    {
      "sequence": 18,
      "phase": "extension:session_start",
      "generation": 3,
      "reason": "resume",
      "targetSessionFile": null,
      "previousSessionFile": "session-file-2"
    },
    {
      "sequence": 19,
      "phase": "rebind-session:extensions-bound",
      "sessionObject": "session-object-3",
      "generation": 3
    },
    {
      "sequence": 20,
      "phase": "public-listener:attach",
      "sessionObject": "session-object-3",
      "bindingReason": "replacement"
    },
    {
      "sequence": 21,
      "phase": "rebind-session:end",
      "sessionObject": "session-object-3",
      "generation": 3
    },
    {
      "sequence": 22,
      "phase": "with-session:resume",
      "sessionObject": "session-object-3",
      "sessionFile": "session-file-1",
      "cwdMatches": true,
      "isIdle": true
    },
    {
      "sequence": 23,
      "phase": "extension:session_shutdown",
      "generation": 3,
      "reason": "quit",
      "targetSessionFile": null,
      "previousSessionFile": null
    },
    {
      "sequence": 24,
      "phase": "before-session-invalidate",
      "sessionObject": "session-object-3",
      "sessionFile": "session-file-1"
    }
  ],
  "legacyPublicEvents": [
    {
      "sequence": 1,
      "sessionObject": "session-object-1",
      "type": "agent_start"
    },
    {
      "sequence": 2,
      "sessionObject": "session-object-1",
      "type": "turn_start"
    },
    {
      "sequence": 3,
      "sessionObject": "session-object-1",
      "type": "message_end",
      "messageRole": "user",
      "messageText": "Create the original replacement session fact."
    },
    {
      "sequence": 4,
      "sessionObject": "session-object-1",
      "type": "message_end",
      "messageRole": "assistant",
      "messageText": "Original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 5,
      "sessionObject": "session-object-1",
      "type": "turn_end",
      "messageRole": "assistant",
      "messageText": "Original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 6,
      "sessionObject": "session-object-1",
      "type": "agent_end",
      "willRetry": false
    },
    {
      "sequence": 7,
      "sessionObject": "session-object-1",
      "type": "agent_settled"
    }
  ],
  "reboundPublicEvents": [
    {
      "sequence": 1,
      "sessionObject": "session-object-1",
      "type": "agent_start"
    },
    {
      "sequence": 2,
      "sessionObject": "session-object-1",
      "type": "turn_start"
    },
    {
      "sequence": 3,
      "sessionObject": "session-object-1",
      "type": "message_end",
      "messageRole": "user",
      "messageText": "Create the original replacement session fact."
    },
    {
      "sequence": 4,
      "sessionObject": "session-object-1",
      "type": "message_end",
      "messageRole": "assistant",
      "messageText": "Original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 5,
      "sessionObject": "session-object-1",
      "type": "turn_end",
      "messageRole": "assistant",
      "messageText": "Original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 6,
      "sessionObject": "session-object-1",
      "type": "agent_end",
      "willRetry": false
    },
    {
      "sequence": 7,
      "sessionObject": "session-object-1",
      "type": "agent_settled"
    },
    {
      "sequence": 8,
      "sessionObject": "session-object-2",
      "type": "agent_start"
    },
    {
      "sequence": 9,
      "sessionObject": "session-object-2",
      "type": "turn_start"
    },
    {
      "sequence": 10,
      "sessionObject": "session-object-2",
      "type": "message_end",
      "messageRole": "user",
      "messageText": "Create the new replacement session fact."
    },
    {
      "sequence": 11,
      "sessionObject": "session-object-2",
      "type": "message_end",
      "messageRole": "assistant",
      "messageText": "New session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 12,
      "sessionObject": "session-object-2",
      "type": "turn_end",
      "messageRole": "assistant",
      "messageText": "New session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 13,
      "sessionObject": "session-object-2",
      "type": "agent_end",
      "willRetry": false
    },
    {
      "sequence": 14,
      "sessionObject": "session-object-2",
      "type": "agent_settled"
    },
    {
      "sequence": 15,
      "sessionObject": "session-object-3",
      "type": "agent_start"
    },
    {
      "sequence": 16,
      "sessionObject": "session-object-3",
      "type": "turn_start"
    },
    {
      "sequence": 17,
      "sessionObject": "session-object-3",
      "type": "message_end",
      "messageRole": "user",
      "messageText": "Append a fact after resuming the original session."
    },
    {
      "sequence": 18,
      "sessionObject": "session-object-3",
      "type": "message_end",
      "messageRole": "assistant",
      "messageText": "Resumed original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 19,
      "sessionObject": "session-object-3",
      "type": "turn_end",
      "messageRole": "assistant",
      "messageText": "Resumed original session response.",
      "stopReason": "stop"
    },
    {
      "sequence": 20,
      "sessionObject": "session-object-3",
      "type": "agent_end",
      "willRetry": false
    },
    {
      "sequence": 21,
      "sessionObject": "session-object-3",
      "type": "agent_settled"
    }
  ],
  "negativeEvidence": {
    "legacySubscriptionMigrated": false,
    "legacyCountAfterOriginalPrompt": 7,
    "legacyCountAfterNewPrompt": 7,
    "legacyCountAfterResumePrompt": 7,
    "publicSubscriptionRequiresRebind": true
  },
  "aliases": {
    "sessionObjects": [
      "session-object-1",
      "session-object-2",
      "session-object-3"
    ],
    "sessionFiles": [
      "session-file-1",
      "session-file-2"
    ]
  },
  "counts": {
    "extension": {
      "agent_end": 3,
      "agent_settled": 3,
      "input": 3,
      "message_end": 6,
      "session_before_switch": 2,
      "session_shutdown": 3,
      "session_start": 3
    },
    "legacyPublic": {
      "agent_end": 1,
      "agent_settled": 1,
      "agent_start": 1,
      "message_end": 2,
      "turn_end": 1,
      "turn_start": 1
    },
    "reboundPublic": {
      "agent_end": 3,
      "agent_settled": 3,
      "agent_start": 3,
      "message_end": 6,
      "turn_end": 3,
      "turn_start": 3
    },
    "extensionGenerations": 3,
    "sessionObjects": 3,
    "sessionFiles": 2
  },
  "lifecycleNotes": [
    {
      "type": "runtime-dispose-boundary",
      "mechanism": "AgentSessionRuntime.dispose",
      "reason": "exit"
    }
  ]
};

function requireValue(condition, message) {
  if (!condition) violations.push(message);
}

function requireExact(actual, expected, message) {
  requireValue(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function fingerprint(value) {
  const clone = structuredClone(value);
  delete clone.contractFingerprint;
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function eventTypes(events) {
  return events.map((event) => event.type);
}

function count(events, type) {
  return events.filter((event) => event.type === type).length;
}

function checkContiguousSequence(events, label) {
  for (let index = 0; index < events.length; index += 1) {
    requireValue(
      events[index]?.sequence === index + 1,
      `${label} sequence is not contiguous at index ${index}.`,
    );
  }
}

const [resultText, packageText, workflow, captureSource, spikeReport, lifecycleDocument, architecture, projectState] =
  await Promise.all([
    readFile(inputPath, "utf8"),
    readFile("package.json", "utf8"),
    readFile(".github/workflows/pi-compaction-session-replacement.yml", "utf8"),
    readFile("scripts/probes/pi-compaction-session-replacement-capture.mjs", "utf8"),
    readFile("docs/spikes/pi-runtime-contract/README.md", "utf8"),
    readFile("docs/spikes/pi-runtime-contract/compaction-session-replacement-lifecycle.md", "utf8"),
    readFile("docs/architecture/pi-integration.md", "utf8"),
    readFile("docs/harness/project-state.md", "utf8"),
  ]);
const result = JSON.parse(resultText);
const packageJson = JSON.parse(packageText);

requireValue(
  packageJson.scripts?.["check:pi-compaction-session-replacement"] ===
    "node scripts/check-pi-compaction-session-replacement-result.mjs",
  "package.json must expose the exact Compaction / Session Replacement check command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:pi-compaction-session-replacement"),
  "package.json scripts.check must execute the Compaction / Session Replacement checker.",
);
requireValue(
  packageJson.scripts?.["probe:pi:compaction-session-replacement"] ===
    "PI_LIFECYCLE_SCENARIO=compaction-session-replacement PI_LIFECYCLE_CAPTURE_SCRIPT=scripts/probes/pi-compaction-session-replacement-capture.mjs node scripts/probes/pi-lifecycle-ci.mjs",
  "package.json must expose the exact Compaction / Session Replacement probe command.",
);

for (const required of [
  "name: Pi Compaction and Session Replacement contract",
  "name: Pi Compaction and Session Replacement lifecycle probe",
  DEFAULT_FIXTURE,
  "scripts/check-pi-compaction-session-replacement-result.mjs",
  "scripts/probes/pi-compaction-session-replacement-capture.mjs",
  "PI_LIFECYCLE_SCENARIO=compaction-session-replacement",
  "PI_LIFECYCLE_COMMITTED_FIXTURE=/probe/packages/pi-adapter/fixtures/pi-lifecycle-compaction-session-replacement.json",
  "node scripts/probes/pi-lifecycle-ci.mjs",
  'node scripts/check-pi-compaction-session-replacement-result.mjs "$PI_COMPACTION_SESSION_REPLACEMENT_OUTPUT"',
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "if: always()",
  "persist-credentials: false",
  "--read-only",
  "--user=1000:1000",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "PI_PROBE_HOST_WORKSPACE_MOUNTED=false",
]) {
  requireValue(workflow.includes(required), `Compaction workflow is missing required token: ${required}`);
}
requireValue(!workflow.includes("pull_request_target:"), "Compaction workflow must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(workflow), "Compaction workflow must not inject repository secrets.");

for (const required of [
  'const SCENARIO = "compaction-session-replacement";',
  'const COMPACTION_SUMMARY = [',
  'compaction: { keepRecentTokens: 1 }',
  'pi.on("session_before_compact"',
  'if (!["compaction_start", "entry_appended", "compaction_end"].includes(event.type)) return;',
  'await initialSession.bindExtensions({});',
  'runtime.setBeforeSessionInvalidate(() => {',
  'runtime.setRebindSession(async (session) => {',
  'await session.bindExtensions({});',
  'withSession: async (ctx) => {',
  'legacySubscriptionMigrated',
]) {
  requireValue(captureSource.includes(required), `Capture must preserve Runtime boundary fragment: ${required}`);
}

requireValue(result.schemaVersion === 1, "Compaction/replacement schemaVersion must be 1.");
requireValue(result.status === "passed", `Compaction/replacement status must be passed, got ${result.status}.`);
requireValue(result.scenario === "compaction-session-replacement", "Scenario must be compaction-session-replacement.");
requireExact(
  result.upstream,
  { repository: "earendil-works/pi", releaseTag: "v0.84.1", commit: "53fa77ccd8a279eb87e92294ef3687b03ff80112" },
  "Compaction/replacement upstream baseline drifted.",
);
requireExact(
  result.artifact,
  {
    name: "@earendil-works/pi-coding-agent",
    version: "0.84.1",
    integrity: "sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==",
    shasum: "e098cada629fdeeb9df6e77c6d480d43e1b2c553",
    installScriptsExecuted: false,
  },
  "Compaction/replacement Artifact identity drifted.",
);
requireExact(
  result.environment,
  {
    node: "22.23.1",
    npm: "10.9.8",
    platform: "linux-x64",
    containerImage: "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  },
  "Compaction/replacement environment drifted.",
);
requireExact(
  result.isolation,
  {
    hostSecretsPassedToProbe: false,
    hostWorkspaceMounted: false,
    sourceBundleReadOnly: true,
    containerRootFilesystemReadOnly: true,
    containerCapabilitiesDropped: true,
    containerNoNewPrivileges: true,
  },
  "Compaction/replacement isolation contract drifted.",
);
requireValue(result.contractFingerprint === fingerprint(result), "Outer Compaction fingerprint is invalid.");
requireValue(result.contractFingerprint === EXPECTED_OUTER_FINGERPRINT, "Outer Compaction fingerprint drifted.");
requireValue(sha256(resultText) === EXPECTED_RESULT_SHA256, "Committed Compaction Fixture bytes drifted.");

const nested = result.capture;
requireValue(nested?.schemaVersion === 1, "Nested Compaction schemaVersion must be 1.");
requireValue(nested?.status === "passed", `Nested Compaction status must be passed, got ${nested?.status}.`);
requireValue(nested?.scenario === "compaction-session-replacement", "Nested scenario is incorrect.");
requireExact(
  nested?.package,
  { name: "@earendil-works/pi-coding-agent", version: "0.84.1" },
  "Nested package identity drifted.",
);
requireExact(
  nested?.cases?.manualCompaction,
  EXPECTED_MANUAL_COMPACTION,
  "Manual Compaction case differs from the verified Runtime capture.",
);
requireExact(
  nested?.cases?.sessionReplacement,
  EXPECTED_SESSION_REPLACEMENT,
  "Session Replacement case differs from the verified Runtime capture.",
);
requireExact(
  nested?.sanitization,
  {
    absolutePathsIncluded: false,
    rawSessionIdIncluded: false,
    rawSessionFileIncluded: false,
    rawEntryIdIncluded: false,
    environmentDumpIncluded: false,
    credentialsIncluded: false,
    rawChainOfThoughtIncluded: false,
  },
  "Compaction/replacement sanitization contract drifted.",
);
requireValue(nested.contractFingerprint === fingerprint(nested), "Nested Compaction fingerprint is invalid.");
requireValue(nested.contractFingerprint === EXPECTED_CAPTURE_FINGERPRINT, "Nested Compaction fingerprint drifted.");

const compact = nested.cases.manualCompaction;
checkContiguousSequence(compact.publicEvents, "Manual Compaction Public events");
checkContiguousSequence(compact.extensionEvents, "Manual Compaction Extension events");
requireExact(
  eventTypes(compact.publicEvents),
  ["compaction_start", "compaction_end"],
  "Manual Compaction Public event sequence drifted.",
);
requireExact(
  eventTypes(compact.extensionEvents),
  ["session_before_compact", "session_compact", "session_shutdown"],
  "Manual Compaction Extension event sequence drifted.",
);
requireValue(count(compact.publicEvents, "entry_appended") === 0, "Manual compact() unexpectedly exposed Public entry_appended.");
requireValue(
  compact.provider.callsBeforeCompact === compact.provider.callsAfterCompact &&
    compact.provider.pendingBeforeCompact === compact.provider.pendingAfterCompact,
  "Extension-provided Compaction unexpectedly contacted the Faux provider.",
);
requireExact(
  compact.before.messages.map((message) => message.role),
  ["user", "assistant", "user", "assistant"],
  "Pre-Compaction model context roles drifted.",
);
requireExact(
  compact.after.messages.map((message) => message.role),
  ["compactionSummary", "assistant"],
  "Post-Compaction model context roles drifted.",
);
requireExact(
  compact.after.entryTypes,
  ["model_change", "thinking_level_change", "message", "message", "message", "message", "compaction"],
  "Compaction Entry tree no longer preserves original message entries plus one Compaction entry.",
);
requireValue(compact.before.stats.totalMessages === 4 && compact.after.stats.totalMessages === 4, "Compaction stats must retain four historical messages.");
requireValue(compact.after.stats.cost === 0.23, "Compaction usage cost must remain visible in Session stats.");
requireValue(compact.after.isIdle === true && compact.after.isCompacting === false, "compact() must return after an idle, non-compacting boundary.");

const replacement = nested.cases.sessionReplacement;
for (const [events, label] of [
  [replacement.extensionEvents, "Replacement Extension events"],
  [replacement.replacementPhases, "Replacement phases"],
  [replacement.legacyPublicEvents, "Legacy Public events"],
  [replacement.reboundPublicEvents, "Rebound Public events"],
]) {
  checkContiguousSequence(events, label);
}
requireExact(
  replacement.extensionEvents.filter((event) => event.type === "session_start").map((event) => event.reason),
  ["startup", "new", "resume"],
  "Extension session_start reasons drifted.",
);
requireExact(
  replacement.extensionEvents.filter((event) => event.type === "session_before_switch").map((event) => event.reason),
  ["new", "resume"],
  "Extension session_before_switch reasons drifted.",
);
requireExact(
  replacement.extensionEvents.filter((event) => event.type === "session_shutdown").map((event) => event.reason),
  ["new", "resume", "quit"],
  "Extension session_shutdown reasons drifted.",
);
requireExact(
  replacement.aliases,
  { sessionObjects: ["session-object-1", "session-object-2", "session-object-3"], sessionFiles: ["session-file-1", "session-file-2"] },
  "Replacement identity aliases drifted.",
);
requireValue(replacement.negativeEvidence.legacySubscriptionMigrated === false, "Legacy Public listener unexpectedly migrated.");
requireValue(replacement.negativeEvidence.publicSubscriptionRequiresRebind === true, "Public listener Rebind negative evidence drifted.");
requireValue(replacement.legacyPublicEvents.length === 7, "Legacy Public listener must receive only the original Prompt lifecycle.");
requireValue(replacement.reboundPublicEvents.length === 21, "Explicit Rebind listener must receive all three Prompt lifecycles.");
requireValue(replacement.snapshots.newBeforePrompt.messages.length === 0, "New Session must begin with empty messages.");
requireExact(
  replacement.snapshots.resumedBeforePrompt.messages,
  replacement.snapshots.initial.messages,
  "Resume must restore the original Session messages.",
);
requireExact(
  replacement.snapshots.resumedAfterPrompt.messages.map((message) => message.role),
  ["user", "assistant", "user", "assistant"],
  "Resume Prompt must append a new turn to the original Session File.",
);
const phases = replacement.replacementPhases.map((phase) => phase.phase);
requireValue(
  phases.indexOf("extension:session_shutdown") < phases.indexOf("before-session-invalidate"),
  "Old Extension shutdown must precede invalidation.",
);
for (const [sessionObject, withSessionPhase] of [
  ["session-object-2", "with-session:new"],
  ["session-object-3", "with-session:resume"],
]) {
  const bound = replacement.replacementPhases.find(
    (phase) => phase.phase === "rebind-session:extensions-bound" && phase.sessionObject === sessionObject,
  );
  const attached = replacement.replacementPhases.find(
    (phase) =>
      phase.phase === "public-listener:attach" &&
      phase.sessionObject === sessionObject &&
      phase.bindingReason === "replacement",
  );
  const rebound = replacement.replacementPhases.find(
    (phase) => phase.phase === "rebind-session:end" && phase.sessionObject === sessionObject,
  );
  const withSession = replacement.replacementPhases.find(
    (phase) => phase.phase === withSessionPhase && phase.sessionObject === sessionObject,
  );
  requireValue(
    bound?.sequence < attached?.sequence &&
      attached?.sequence < rebound?.sequence &&
      rebound?.sequence < withSession?.sequence,
    `${sessionObject} must bind Extensions, attach Public listener, finish Rebind, then invoke ${withSessionPhase}.`,
  );
}

const serialized = JSON.stringify(result);
for (const pattern of [
  /\/home\/runner\//,
  /\/tmp\/zhiwei-pi-lifecycle-/,
  /[A-Za-z]:\\Users\\/,
  /GITHUB_TOKEN/i,
  /authorization:\s*bearer/i,
  /cookie:/i,
  /api[_-]?key/i,
  /\.jsonl(?:"|\\|\/)/i,
]) {
  requireValue(!pattern.test(serialized), `Compaction/replacement result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Result must not contain a raw sessionId field.");
requireValue(
  !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
  "Result must not contain raw UUID-shaped Session or Entry IDs.",
);

for (const [name, document, tokens] of [
  [
    "Compaction lifecycle document",
    lifecycleDocument,
    [
      "runtime-verified",
      "compaction_start → compaction_end",
      "Public entry_appended   = 0",
      "compactionSummary → assistant",
      "session-object-1 → session-object-2 → session-object-3",
      "session-file-1 → session-file-2 → session-file-1",
      "旧 Public Listener 不迁移",
      EXPECTED_RESULT_SHA256,
      EXPECTED_OUTER_FINGERPRINT,
      EXPECTED_CAPTURE_FINGERPRINT,
    ],
  ],
  [
    "Pi spike report",
    spikeReport,
    [
      "source-and-runtime-verified-compaction-session-replacement",
      DEFAULT_FIXTURE,
      "compaction-session-replacement-lifecycle.md",
      "Public `entry_appended`没有出现",
      "旧 Public Listener不会自动迁移",
      EXPECTED_OUTER_FINGERPRINT,
    ],
  ],
  [
    "Pi integration architecture",
    architecture,
    [
      "source-and-runtime-verified-compaction-session-replacement",
      "Compaction Summary是派生上下文",
      "Session File Identity与内存 Session Object Identity",
      "旧 Public Listener不会自动迁移",
      "Public `entry_appended`",
    ],
  ],
  [
    "project state",
    projectState,
    [
      "Compaction 与 Session Replacement Fixture",
      "compactionSummary → assistant",
      "session-object-1 → session-object-2 → session-object-3",
      "旧 Public Listener不会自动迁移",
      "RPC真实 Prompt",
    ],
  ],
]) {
  for (const token of tokens) {
    requireValue(document.includes(token), `${name} is missing token: ${token}`);
  }
}

if (violations.length > 0) {
  console.error(
    "Pi Compaction / Session Replacement result violations:\n" +
      violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Pi Compaction / Session Replacement runtime result: OK (${result.contractFingerprint})`);
