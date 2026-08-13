import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_FIXTURE = "packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json";
const inputPath = resolve(
  process.argv[2] ?? process.env.PI_PARALLEL_TOOL_ORDERING_OUTPUT ?? DEFAULT_FIXTURE,
);
const violations = [];

const EXPECTED_OUTER_FINGERPRINT = "fd372a8e73f4545bd7a34c6ac3e82cfc2d044dca473ae374627b847864389b02";
const EXPECTED_CAPTURE_FINGERPRINT = "164f0e95e7f617c7aa69d1a1b34a5ae7935673c1ee852fa452541d15c1551376";
const EXPECTED_RESULT_SHA256 = "0e490594e62886c707274359edd47675b00eba582408fe5fc68ac557f5c1bed2";
const EXPECTED_DECLARATION_ORDER = [
  "zhiwei-parallel-tool-alpha",
  "zhiwei-parallel-tool-beta",
  "zhiwei-parallel-tool-gamma"
];
const EXPECTED_COMPLETION_ORDER = [
  "zhiwei-parallel-tool-beta",
  "zhiwei-parallel-tool-gamma",
  "zhiwei-parallel-tool-alpha"
];
const EXPECTED_SESSION_TYPES = [
  "agent_start",
  "turn_start",
  "message_start",
  "message_end",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_start",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_update",
  "tool_execution_update",
  "tool_execution_end",
  "tool_execution_end",
  "tool_execution_end",
  "message_start",
  "message_end",
  "message_start",
  "message_end",
  "message_start",
  "message_end",
  "turn_end",
  "turn_start",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "agent_settled"
];
const EXPECTED_EXTENSION_TYPES = [
  "input",
  "before_agent_start",
  "agent_start",
  "turn_start",
  "message_start",
  "message_end",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "tool_call",
  "tool_call",
  "tool_call",
  "tool_result",
  "tool_result",
  "tool_result",
  "message_start",
  "message_end",
  "message_start",
  "message_end",
  "message_start",
  "message_end",
  "turn_end",
  "turn_start",
  "message_start",
  "message_update",
  "message_update",
  "message_update",
  "message_end",
  "turn_end",
  "agent_end",
  "agent_settled",
  "session_shutdown"
];
const EXPECTED_TOOL_BATCH = {
  "toolName": "ordered_echo",
  "calls": [
    {
      "lane": "alpha",
      "toolCallId": "zhiwei-parallel-tool-alpha"
    },
    {
      "lane": "beta",
      "toolCallId": "zhiwei-parallel-tool-beta"
    },
    {
      "lane": "gamma",
      "toolCallId": "zhiwei-parallel-tool-gamma"
    }
  ],
  "declarationOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "plannedCompletionOrder": [
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma",
    "zhiwei-parallel-tool-alpha"
  ],
  "deadlockGuardMs": 5000,
  "activeBeforePrompt": [
    "ordered_echo"
  ],
  "activeAfterPrompt": [
    "ordered_echo"
  ],
  "executions": [
    {
      "sequence": 1,
      "phase": "start",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "toolName": "ordered_echo",
      "lane": "alpha"
    },
    {
      "sequence": 2,
      "phase": "start",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "toolName": "ordered_echo",
      "lane": "beta"
    },
    {
      "sequence": 3,
      "phase": "start",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "toolName": "ordered_echo",
      "lane": "gamma"
    },
    {
      "sequence": 4,
      "phase": "end",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "toolName": "ordered_echo",
      "lane": "beta"
    },
    {
      "sequence": 5,
      "phase": "end",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "toolName": "ordered_echo",
      "lane": "gamma"
    },
    {
      "sequence": 6,
      "phase": "end",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "toolName": "ordered_echo",
      "lane": "alpha"
    }
  ],
  "barrierTrace": [
    {
      "sequence": 1,
      "type": "execute-start",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "lane": "alpha"
    },
    {
      "sequence": 2,
      "type": "execute-start",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "lane": "beta"
    },
    {
      "sequence": 3,
      "type": "execute-start",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "lane": "gamma"
    },
    {
      "sequence": 4,
      "type": "all-tools-started",
      "toolCallIds": [
        "zhiwei-parallel-tool-alpha",
        "zhiwei-parallel-tool-beta",
        "zhiwei-parallel-tool-gamma"
      ]
    },
    {
      "sequence": 5,
      "type": "release",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "reason": "all-tools-started",
      "completionIndex": 0
    },
    {
      "sequence": 6,
      "type": "execute-end",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "lane": "beta"
    },
    {
      "sequence": 7,
      "type": "public-tool-end",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "expectedToolCallId": "zhiwei-parallel-tool-beta",
      "completionIndex": 0
    },
    {
      "sequence": 8,
      "type": "release",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "reason": "public-tool-end:zhiwei-parallel-tool-beta",
      "completionIndex": 1
    },
    {
      "sequence": 9,
      "type": "execute-end",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "lane": "gamma"
    },
    {
      "sequence": 10,
      "type": "public-tool-end",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "expectedToolCallId": "zhiwei-parallel-tool-gamma",
      "completionIndex": 1
    },
    {
      "sequence": 11,
      "type": "release",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "reason": "public-tool-end:zhiwei-parallel-tool-gamma",
      "completionIndex": 2
    },
    {
      "sequence": 12,
      "type": "execute-end",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "lane": "alpha"
    },
    {
      "sequence": 13,
      "type": "public-tool-end",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "expectedToolCallId": "zhiwei-parallel-tool-alpha",
      "completionIndex": 2
    },
    {
      "sequence": 14,
      "type": "completion-plan-finished",
      "reason": "public-tool-end:zhiwei-parallel-tool-alpha"
    }
  ],
  "barrierFailure": null
};
const EXPECTED_OUTCOME = {
  "finalText": "Parallel tool ordering capture complete.",
  "expectedFinalText": "Parallel tool ordering capture complete.",
  "sessionWasIdleBeforeShutdown": true,
  "pendingMessageCountBeforeShutdown": 0,
  "messageRoles": [
    "user",
    "assistant",
    "toolResult",
    "toolResult",
    "toolResult",
    "assistant"
  ],
  "finalMessages": [
    {
      "index": 0,
      "role": "user",
      "contentKinds": [
        "text"
      ],
      "text": "Call ordered_echo for alpha, beta, and gamma in that order in one assistant response, then finish."
    },
    {
      "index": 1,
      "role": "assistant",
      "stopReason": "toolUse",
      "contentKinds": [
        "toolCall",
        "toolCall",
        "toolCall"
      ],
      "toolCallIds": [
        "zhiwei-parallel-tool-alpha",
        "zhiwei-parallel-tool-beta",
        "zhiwei-parallel-tool-gamma"
      ],
      "toolNames": [
        "ordered_echo",
        "ordered_echo",
        "ordered_echo"
      ]
    },
    {
      "index": 2,
      "role": "toolResult",
      "toolCallId": "zhiwei-parallel-tool-alpha",
      "toolName": "ordered_echo",
      "isError": false,
      "contentKinds": [
        "text"
      ],
      "text": "ordered echo result: alpha"
    },
    {
      "index": 3,
      "role": "toolResult",
      "toolCallId": "zhiwei-parallel-tool-beta",
      "toolName": "ordered_echo",
      "isError": false,
      "contentKinds": [
        "text"
      ],
      "text": "ordered echo result: beta"
    },
    {
      "index": 4,
      "role": "toolResult",
      "toolCallId": "zhiwei-parallel-tool-gamma",
      "toolName": "ordered_echo",
      "isError": false,
      "contentKinds": [
        "text"
      ],
      "text": "ordered echo result: gamma"
    },
    {
      "index": 5,
      "role": "assistant",
      "stopReason": "stop",
      "contentKinds": [
        "text"
      ],
      "text": "Parallel tool ordering capture complete."
    }
  ]
};
const EXPECTED_COUNTS = {
  "sessionEvents": 40,
  "extensionEvents": 40,
  "publicByType": {
    "agent_end": 1,
    "agent_settled": 1,
    "agent_start": 1,
    "message_end": 6,
    "message_start": 6,
    "message_update": 12,
    "tool_execution_end": 3,
    "tool_execution_start": 3,
    "tool_execution_update": 3,
    "turn_end": 2,
    "turn_start": 2
  },
  "extensionByType": {
    "agent_end": 1,
    "agent_settled": 1,
    "agent_start": 1,
    "before_agent_start": 1,
    "input": 1,
    "message_end": 6,
    "message_start": 6,
    "message_update": 12,
    "session_shutdown": 1,
    "tool_call": 3,
    "tool_result": 3,
    "turn_end": 2,
    "turn_start": 2
  },
  "sessionToolStarts": 3,
  "sessionToolUpdates": 3,
  "sessionToolEnds": 3,
  "extensionToolCalls": 3,
  "extensionToolResults": 3,
  "extensionAgentEnds": 1,
  "extensionAgentSettled": 1,
  "extensionSessionShutdowns": 1
};
const EXPECTED_CORRELATIONS = {
  "expectedToolCallIds": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "observedOrders": {
    "declarationOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "plannedCompletionOrder": [
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma",
      "zhiwei-parallel-tool-alpha"
    ],
    "executeStartOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "executeEndOrder": [
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma",
      "zhiwei-parallel-tool-alpha"
    ],
    "publicStartOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "publicUpdateOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "publicEndOrder": [
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma",
      "zhiwei-parallel-tool-alpha"
    ],
    "extensionCallOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "extensionResultOrder": [
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma",
      "zhiwei-parallel-tool-alpha"
    ],
    "publicResultMessageStartOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "publicResultMessageEndOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "extensionResultMessageStartOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "extensionResultMessageEndOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "publicTurnToolResultOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "extensionTurnToolResultOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ],
    "finalSessionToolResultOrder": [
      "zhiwei-parallel-tool-alpha",
      "zhiwei-parallel-tool-beta",
      "zhiwei-parallel-tool-gamma"
    ]
  },
  "everyObservedOrderUsesEachExpectedIdExactlyOnce": true
};
const EXPECTED_ORDERING = {
  "declarationOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "plannedCompletionOrder": [
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma",
    "zhiwei-parallel-tool-alpha"
  ],
  "executeStartOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "executeEndOrder": [
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma",
    "zhiwei-parallel-tool-alpha"
  ],
  "publicStartOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "publicUpdateOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "publicEndOrder": [
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma",
    "zhiwei-parallel-tool-alpha"
  ],
  "extensionCallOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "extensionResultOrder": [
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma",
    "zhiwei-parallel-tool-alpha"
  ],
  "publicResultMessageStartOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "publicResultMessageEndOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "extensionResultMessageStartOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "extensionResultMessageEndOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "publicTurnToolResultOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "extensionTurnToolResultOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "finalSessionToolResultOrder": [
    "zhiwei-parallel-tool-alpha",
    "zhiwei-parallel-tool-beta",
    "zhiwei-parallel-tool-gamma"
  ],
  "allExecutionsStartedBeforeFirstCompletion": true,
  "completionOrderDiffersFromDeclaration": true,
  "agentEndBeforeSettled": true,
  "settledBeforeShutdown": true
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

function eventIds(events, type, field = "toolCallId") {
  return events.filter((event) => event.type === type).map((event) => event[field]);
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
    readFile(".github/workflows/pi-parallel-tool-ordering.yml", "utf8"),
    readFile("scripts/probes/pi-parallel-tool-ordering-capture.mjs", "utf8"),
    readFile("docs/spikes/pi-runtime-contract/README.md", "utf8"),
    readFile("docs/spikes/pi-runtime-contract/parallel-tool-ordering-lifecycle.md", "utf8"),
    readFile("docs/architecture/pi-integration.md", "utf8"),
    readFile("docs/harness/project-state.md", "utf8"),
  ]);
const result = JSON.parse(resultText);
const packageJson = JSON.parse(packageText);

requireValue(
  packageJson.scripts?.["check:pi-parallel-tool-ordering"] ===
    "node scripts/check-pi-parallel-tool-ordering-result.mjs",
  "package.json must expose the exact check:pi-parallel-tool-ordering command.",
);
requireValue(
  packageJson.scripts?.check?.includes("npm run check:pi-parallel-tool-ordering"),
  "package.json scripts.check must execute check:pi-parallel-tool-ordering.",
);
requireValue(
  packageJson.scripts?.["probe:pi:parallel-tool-ordering"] ===
    "PI_LIFECYCLE_SCENARIO=parallel-tool-ordering PI_LIFECYCLE_CAPTURE_SCRIPT=scripts/probes/pi-parallel-tool-ordering-capture.mjs node scripts/probes/pi-lifecycle-ci.mjs",
  "package.json must expose the exact probe:pi:parallel-tool-ordering command.",
);

for (const required of [
  "name: Pi parallel Tool ordering contract",
  "name: Pi parallel Tool ordering lifecycle probe",
  DEFAULT_FIXTURE,
  "scripts/check-pi-parallel-tool-ordering-result.mjs",
  "scripts/probes/pi-parallel-tool-ordering-capture.mjs",
  "PI_LIFECYCLE_SCENARIO=parallel-tool-ordering",
  "PI_LIFECYCLE_COMMITTED_FIXTURE=/probe/packages/pi-adapter/fixtures/pi-lifecycle-parallel-tool-ordering.json",
  "node scripts/probes/pi-lifecycle-ci.mjs",
  'node scripts/check-pi-parallel-tool-ordering-result.mjs "$PI_PARALLEL_TOOL_ORDERING_OUTPUT"',
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "if: success()",
  "persist-credentials: false",
  "--read-only",
  "--user=1000:1000",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "PI_PROBE_HOST_WORKSPACE_MOUNTED=false",
]) {
  requireValue(workflow.includes(required), `Parallel Tool workflow is missing required token: ${required}`);
}
requireValue(!workflow.includes("pull_request_target:"), "Parallel Tool workflow must not use pull_request_target.");
requireValue(!/\$\{\{\s*secrets\./.test(workflow), "Parallel Tool workflow must not inject repository secrets.");

for (const required of [
  'const SCENARIO = "parallel-tool-ordering";',
  'const DEADLOCK_GUARD_MS = 5_000;',
  '"zhiwei-parallel-tool-beta",\n  "zhiwei-parallel-tool-gamma",\n  "zhiwei-parallel-tool-alpha"',
  'recordBarrier("all-tools-started"',
  'if (event.type === "tool_execution_end") observePublicToolEnd(event);',
  "await waitForRelease(toolCallId, signal);",
  "allExecutionsStartedBeforeFirstCompletion",
]) {
  requireValue(captureSource.includes(required), `Capture must preserve deterministic Barrier fragment: ${required}`);
}

requireValue(result.schemaVersion === 1, "Parallel Tool ordering schemaVersion must be 1.");
requireValue(result.status === "passed", `Parallel Tool ordering status must be passed, got ${result.status}.`);
requireValue(result.scenario === "parallel-tool-ordering", "Scenario must be parallel-tool-ordering.");
requireExact(
  result.upstream,
  { repository: "earendil-works/pi", releaseTag: "v0.84.1", commit: "53fa77ccd8a279eb87e92294ef3687b03ff80112" },
  "Parallel Tool ordering upstream baseline drifted.",
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
  "Parallel Tool ordering Artifact identity drifted.",
);
requireExact(
  result.environment,
  {
    node: "22.23.1",
    npm: "10.9.8",
    platform: "linux-x64",
    containerImage: "node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3",
  },
  "Parallel Tool ordering environment drifted.",
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
  "Parallel Tool ordering isolation contract drifted.",
);
requireValue(result.contractFingerprint === fingerprint(result), "Outer parallel Tool fingerprint is invalid.");
requireValue(result.contractFingerprint === EXPECTED_OUTER_FINGERPRINT, "Outer parallel Tool fingerprint drifted.");
requireValue(sha256(resultText) === EXPECTED_RESULT_SHA256, "Committed parallel Tool Fixture bytes drifted.");

const capture = result.capture;
requireValue(capture?.schemaVersion === 1, "Nested parallel Tool schemaVersion must be 1.");
requireValue(capture?.status === "passed", `Nested parallel Tool status must be passed, got ${capture?.status}.`);
requireValue(capture?.scenario === "parallel-tool-ordering", "Nested scenario must be parallel-tool-ordering.");
requireExact(
  capture?.package,
  { name: "@earendil-works/pi-coding-agent", version: "0.84.1" },
  "Nested parallel Tool package identity drifted.",
);
requireExact(
  capture?.provider,
  {
    id: "zhiwei-parallel-tool-faux",
    api: "zhiwei-parallel-tool-faux-api",
    callCount: 2,
    pendingResponses: 0,
    promptsSentToExternalProvider: 0,
  },
  "Parallel Tool Faux provider evidence drifted.",
);
requireExact(
  capture?.prompt,
  {
    source: "interactive",
    text: "Call ordered_echo for alpha, beta, and gamma in that order in one assistant response, then finish.",
  },
  "Parallel Tool prompt contract drifted.",
);
requireExact(capture?.toolBatch, EXPECTED_TOOL_BATCH, "Parallel Tool batch and Barrier trace drifted.");
requireExact(capture?.outcome, EXPECTED_OUTCOME, "Parallel Tool final Session state drifted.");
requireExact(capture?.counts, EXPECTED_COUNTS, "Parallel Tool event counts drifted.");
requireExact(capture?.correlations, EXPECTED_CORRELATIONS, "Parallel Tool correlations drifted.");
requireExact(capture?.ordering, EXPECTED_ORDERING, "Parallel Tool ordering contract drifted.");
requireValue(capture?.contractFingerprint === fingerprint(capture), "Nested parallel Tool fingerprint is invalid.");
requireValue(capture?.contractFingerprint === EXPECTED_CAPTURE_FINGERPRINT, "Nested parallel Tool fingerprint drifted.");

const sessionEvents = capture?.sessionEvents ?? [];
const extensionEvents = capture?.extensionEvents ?? [];
checkContiguousSequence(sessionEvents, "Public Session event");
checkContiguousSequence(extensionEvents, "Extension event");
requireExact(eventTypes(sessionEvents), EXPECTED_SESSION_TYPES, "Public parallel Tool event type sequence drifted.");
requireExact(eventTypes(extensionEvents), EXPECTED_EXTENSION_TYPES, "Extension parallel Tool event type sequence drifted.");

requireExact(eventIds(sessionEvents, "tool_execution_start"), EXPECTED_DECLARATION_ORDER, "Public Tool start order drifted.");
requireExact(eventIds(sessionEvents, "tool_execution_update"), EXPECTED_DECLARATION_ORDER, "Public Tool update order drifted.");
requireExact(eventIds(sessionEvents, "tool_execution_end"), EXPECTED_COMPLETION_ORDER, "Public Tool end order drifted.");
requireExact(eventIds(extensionEvents, "tool_call"), EXPECTED_DECLARATION_ORDER, "Extension tool_call order drifted.");
requireExact(eventIds(extensionEvents, "tool_result"), EXPECTED_COMPLETION_ORDER, "Extension tool_result order drifted.");

requireExact(
  capture?.ordering?.publicResultMessageStartOrder,
  EXPECTED_DECLARATION_ORDER,
  "Public Tool Result message order must return to Assistant declaration order.",
);
requireExact(
  capture?.ordering?.extensionResultMessageStartOrder,
  EXPECTED_DECLARATION_ORDER,
  "Extension Tool Result message order must return to Assistant declaration order.",
);
requireExact(
  capture?.ordering?.publicTurnToolResultOrder,
  EXPECTED_DECLARATION_ORDER,
  "Public turn_end.toolResults order must follow Assistant declaration order.",
);
requireExact(
  capture?.ordering?.finalSessionToolResultOrder,
  EXPECTED_DECLARATION_ORDER,
  "Final Session Tool Result message order must follow Assistant declaration order.",
);
requireValue(
  JSON.stringify(EXPECTED_COMPLETION_ORDER) !== JSON.stringify(EXPECTED_DECLARATION_ORDER),
  "The verified completion order must intentionally differ from declaration order.",
);
requireValue(
  sessionEvents.findIndex((event) => event.type === "message_start" && event.messageRole === "toolResult") >
    sessionEvents.findLastIndex((event) => event.type === "tool_execution_end"),
  "Public Tool Result messages must start only after all Tool completions are observed.",
);
requireValue(
  extensionEvents.findIndex((event) => event.type === "message_start" && event.messageRole === "toolResult") >
    extensionEvents.findLastIndex((event) => event.type === "tool_result"),
  "Extension Tool Result messages must start only after all Extension tool_result events.",
);
requireValue(count(sessionEvents, "turn_start") === 2 && count(sessionEvents, "turn_end") === 2, "Parallel Tool scenario must contain exactly two Turns.");
requireValue(count(sessionEvents, "agent_start") === 1 && count(sessionEvents, "agent_end") === 1, "Parallel Tool scenario must remain one Agent Run.");
requireValue(count(sessionEvents, "agent_settled") === 1, "Public Session must emit one agent_settled.");
requireValue(count(extensionEvents, "agent_settled") === 1, "Extension must emit one agent_settled.");
requireValue(count(extensionEvents, "session_shutdown") === 1, "Extension must emit one session_shutdown.");
requireValue(
  !Object.hasOwn(extensionEvents.find((event) => event.type === "agent_end") ?? {}, "willRetry"),
  "Extension agent_end must not invent Public Session willRetry.",
);
requireValue(
  sessionEvents.every((event) => !event.type.startsWith("auto_retry_") && event.type !== "queue_update"),
  "Parallel Tool scenario must not include Retry or Queue events.",
);
requireValue(
  extensionEvents.every((event) => !event.type.startsWith("auto_retry_") && event.type !== "queue_update"),
  "Parallel Tool Extension trace must not include Retry or Queue events.",
);
requireExact(
  capture?.lifecycleNotes,
  [{ type: "shutdown-host-boundary", mechanism: "session.extensionRunner.emit", reason: "exit" }],
  "Parallel Tool lifecycle notes drifted.",
);
requireExact(
  capture?.sanitization,
  {
    absolutePathsIncluded: false,
    rawSessionIdIncluded: false,
    environmentDumpIncluded: false,
    credentialsIncluded: false,
    rawChainOfThoughtIncluded: false,
  },
  "Parallel Tool sanitization contract drifted.",
);

const serialized = JSON.stringify(result);
for (const pattern of [
  /\/home\/runner\//,
  /\/tmp\/zhiwei-pi-lifecycle-/,
  /[A-Za-z]:\\Users\\/,
  /GITHUB_TOKEN/i,
  /authorization:\s*bearer/i,
  /cookie:/i,
  /api[_-]?key/i,
]) {
  requireValue(!pattern.test(serialized), `Parallel Tool result contains forbidden pattern: ${pattern}`);
}
requireValue(!serialized.includes('"sessionId"'), "Parallel Tool result must not contain a raw sessionId field.");

for (const [name, document, tokens] of [
  [
    "parallel Tool lifecycle document",
    lifecycleDocument,
    [
      "runtime-verified",
      "beta → gamma → alpha",
      "alpha → beta → gamma",
      "Tool Result 消息",
      EXPECTED_OUTER_FINGERPRINT,
      EXPECTED_CAPTURE_FINGERPRINT,
    ],
  ],
  [
    "Pi spike report",
    spikeReport,
    [
      "source-and-runtime-verified-parallel-tool-ordering",
      "pi-lifecycle-parallel-tool-ordering.json",
      "parallel-tool-ordering-lifecycle.md",
      "完成顺序与消息顺序分离",
      EXPECTED_OUTER_FINGERPRINT,
    ],
  ],
  [
    "Pi integration architecture",
    architecture,
    [
      "source-and-runtime-verified-parallel-tool-ordering",
      "beta → gamma → alpha",
      "alpha → beta → gamma",
      "不能仅凭 `tool_execution_end`",
      "Tool Result消息顺序",
    ],
  ],
  [
    "project state",
    projectState,
    [
      "并行 Tool ordering Fixture",
      "完成顺序为 `beta → gamma → alpha`",
      "消息顺序恢复为 `alpha → beta → gamma`",
      "Compaction与 Session Replacement",
    ],
  ],
]) {
  for (const token of tokens) {
    requireValue(document.includes(token), `${name} is missing token: ${token}`);
  }
}

if (violations.length > 0) {
  console.error(`Pi parallel Tool ordering contract violations:\n- ${violations.join("\n- ")}`);
  process.exit(1);
}

console.log(`Pi parallel Tool ordering runtime result: OK (${result.contractFingerprint})`);
