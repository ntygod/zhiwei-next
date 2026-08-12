import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PI_PACKAGE_NAME,
  PI_PACKAGE_VERSION,
  SDK_RPC_PARITY_FINAL_TEXT,
  SDK_RPC_PARITY_MODEL_ID,
  SDK_RPC_PARITY_PROMPT,
  SDK_RPC_PARITY_PROVIDER_ID,
  SDK_RPC_PARITY_SCENARIO,
  SDK_RPC_PARITY_SCHEMA_VERSION,
} from "./pi-sdk-rpc-parity-contract.mjs";

const installDir = resolveRequiredPath("PI_INSTALL_DIR");
const outputPath = resolve(
  process.env.PI_LIFECYCLE_OUTPUT ?? join(process.cwd(), "pi-sdk-rpc-parity-result.json"),
);
const workspaceDir = resolve(
  process.env.PI_LIFECYCLE_WORKSPACE ?? join(dirname(outputPath), "workspace"),
);
const agentDir = resolve(
  process.env.PI_LIFECYCLE_AGENT_DIR ?? join(dirname(outputPath), "agent"),
);
const primaryCapturePath = fileURLToPath(
  new URL("./pi-sdk-rpc-parity-capture.mjs", import.meta.url),
);
const extensionPath = fileURLToPath(
  new URL("./pi-sdk-rpc-parity-faux-extension.mjs", import.meta.url),
);

let stage = "bootstrap";
let client;
let primary;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableResult(result) {
  const clone = structuredClone(result);
  delete clone.contractFingerprint;
  return JSON.stringify(clone);
}

function redactDynamicPaths(value) {
  let result = String(value);
  for (const [path, replacement] of [
    [installDir, "<pi-install-dir>"],
    [workspaceDir, "<workspace-dir>"],
    [agentDir, "<agent-dir>"],
    [dirname(outputPath), "<output-dir>"],
    [primaryCapturePath, "<primary-capture>"],
    [extensionPath, "<rpc-extension>"],
  ]) {
    if (path) result = result.split(path).join(replacement);
  }
  return result;
}

function normalizeError(error) {
  return {
    stage,
    name: error instanceof Error ? error.name : "Error",
    message: redactDynamicPaths(error instanceof Error ? error.message : String(error)),
  };
}

async function persist(result) {
  result.contractFingerprint = sha256(stableResult(result));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function collectEventsWithoutKeepingProbeAlive(rpcClient, timeout) {
  const originalSetTimeout = globalThis.setTimeout;
  const collectionTimers = [];
  // The public helper owns no cancellation handle. Instrument only the timer it
  // creates so an earlier Prompt failure cannot keep a failed probe alive.
  globalThis.setTimeout = function instrumentedSetTimeout(callback, delay, ...args) {
    const timer = originalSetTimeout(callback, delay, ...args);
    collectionTimers.push(timer);
    timer.unref?.();
    return timer;
  };

  let resultPromise;
  let synchronousError;
  try {
    resultPromise = rpcClient.collectEvents(timeout).then(
      (collectedEvents) => ({ collectedEvents }),
      (error) => ({ error }),
    );
  } catch (error) {
    synchronousError = error;
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  if (synchronousError) {
    for (const timer of collectionTimers) clearTimeout(timer);
    throw synchronousError;
  }
  if (collectionTimers.length !== 1) {
    for (const timer of collectionTimers) clearTimeout(timer);
    throw new Error("Published RpcClient.collectEvents() timer shape drifted.");
  }
  return {
    resultPromise,
    dispose() {
      for (const timer of collectionTimers) clearTimeout(timer);
    },
  };
}

function observeProcessTermination(childProcess) {
  let disposed = false;
  let resolveTermination;
  const resultPromise = new Promise((resolve) => {
    resolveTermination = resolve;
  });
  const settle = (termination) => {
    if (disposed) return;
    disposed = true;
    childProcess.off("error", onError);
    childProcess.off("exit", onExit);
    resolveTermination(termination);
  };
  const onError = (error) => settle({ type: "error", error });
  const onExit = (code, signal) => settle({ type: "exit", code, signal });
  childProcess.once("error", onError);
  childProcess.once("exit", onExit);

  return {
    resultPromise,
    dispose() {
      if (disposed) return;
      disposed = true;
      childProcess.off("error", onError);
      childProcess.off("exit", onExit);
    },
  };
}

async function waitForOperationOrProcessTermination(
  operationPromise,
  processTerminationPromise,
  operationBoundary,
) {
  const outcome = await Promise.race([
    Promise.resolve(operationPromise).then(
      (value) => ({ type: "operation", value }),
      (error) => ({ type: "operation-error", error }),
    ),
    processTerminationPromise.then((termination) => ({
      type: "process-termination",
      termination,
    })),
  ]);
  if (outcome.type === "operation") return outcome.value;
  if (outcome.type === "operation-error") throw outcome.error;
  if (outcome.termination.type === "error") {
    throw new Error(`RpcClient Worker emitted an error before ${operationBoundary}.`);
  }
  throw new Error(
    `RpcClient Worker exited before ${operationBoundary} (code=${outcome.termination.code}, signal=${outcome.termination.signal ?? "null"}).`,
  );
}

function hasMatchingDurableExtensionShutdownEvidence(path, runIdentity) {
  try {
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    return (
      evidence?.runIdentity === runIdentity &&
      evidence?.shutdown?.observed === true &&
      evidence.shutdown.reason === "quit"
    );
  } catch {
    return false;
  }
}

function contentKinds(content) {
  if (!Array.isArray(content)) return [];
  return content.map((item) => item?.type ?? "unknown");
}

function textFromContent(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
  return text || undefined;
}

function textSummary(text) {
  return text === undefined || text === null
    ? undefined
    : {
        length: text.length,
        sha256: sha256(text),
        matchesExpected: text === SDK_RPC_PARITY_FINAL_TEXT,
      };
}

function messageSummary(message, index) {
  const text = textFromContent(message?.content);
  const summary = {
    index,
    role: message?.role,
    contentKinds: contentKinds(message?.content),
  };
  if (message?.stopReason !== undefined) summary.stopReason = message.stopReason;
  if (text !== undefined) summary.text = textSummary(text);
  return summary;
}

function sanitizeState(state) {
  return {
    model: state?.model
      ? { provider: state.model.provider, id: state.model.id, api: state.model.api }
      : null,
    thinkingLevel: state?.thinkingLevel,
    isStreaming: state?.isStreaming,
    isCompacting: state?.isCompacting,
    messageCount: state?.messageCount,
    pendingMessageCount: state?.pendingMessageCount,
    sessionIdPresent: typeof state?.sessionId === "string" && state.sessionId.length > 0,
    sessionFilePresent: typeof state?.sessionFile === "string" && state.sessionFile.length > 0,
  };
}

function sanitizeEvent(event, sequence) {
  const record = { sequence, type: event.type };
  for (const key of ["willRetry", "reason", "attempt", "success", "finalError"]) {
    if (event[key] !== undefined) record[key] = event[key];
  }
  if (event.message) record.message = messageSummary(event.message);
  if (event.assistantMessageEvent) {
    record.updateType = event.assistantMessageEvent.type;
    record.hasPartial = Object.hasOwn(event.assistantMessageEvent, "partial");
    if (typeof event.assistantMessageEvent.delta === "string") {
      record.delta = textSummary(event.assistantMessageEvent.delta);
    }
  }
  return record;
}

function runPrimaryCapture() {
  stage = "primary:capture";
  const primaryOutput = join(dirname(outputPath), "primary-sdk-rpc-parity.json");
  const result = spawnSync(process.execPath, [primaryCapturePath], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PI_LIFECYCLE_OUTPUT: primaryOutput,
      PI_LIFECYCLE_WORKSPACE: join(workspaceDir, "primary"),
      PI_LIFECYCLE_AGENT_DIR: join(agentDir, "primary"),
      PI_LIFECYCLE_SCENARIO: SDK_RPC_PARITY_SCENARIO,
    },
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${process.execPath} ${primaryCapturePath} exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`,
    );
  }
  return primaryOutput;
}

async function captureRpcClientMessages() {
  stage = "rpc-client:configure";
  const codingDir = join(installDir, "node_modules", "@earendil-works", "pi-coding-agent");
  const codingManifest = JSON.parse(await readFile(join(codingDir, "package.json"), "utf8"));
  requireValue(
    codingManifest.name === PI_PACKAGE_NAME && codingManifest.version === PI_PACKAGE_VERSION,
    `Unexpected coding-agent manifest: ${codingManifest.name}@${codingManifest.version}`,
  );
  const coding = await import(
    pathToFileURL(join(codingDir, codingManifest.main ?? "dist/index.js")).href
  );
  requireValue(typeof coding.RpcClient === "function", "Published RpcClient export is missing.");

  const rpcWorkspace = join(workspaceDir, "rpc-client-messages");
  const rpcHome = join(agentDir, "rpc-client-messages-home");
  const extensionEvidencePath = join(
    dirname(outputPath),
    "rpc-client-messages-extension-evidence.json",
  );
  const runIdentity = randomBytes(32).toString("hex");
  stage = "rpc-client:prepare-evidence";
  await rm(extensionEvidencePath, { force: true });
  requireValue(
    !existsSync(extensionEvidencePath),
    "RpcClient Extension evidence path could not be cleared before start().",
  );
  await Promise.all([
    mkdir(rpcWorkspace, { recursive: true }),
    mkdir(rpcHome, { recursive: true }),
  ]);

  client = new coding.RpcClient({
    cliPath: join(codingDir, "dist", "cli.js"),
    cwd: rpcWorkspace,
    env: {
      HOME: rpcHome,
      PI_INSTALL_DIR: installDir,
      PI_RPC_EXTENSION_EVIDENCE: extensionEvidencePath,
      PI_RPC_EXTENSION_RUN_IDENTITY: runIdentity,
      AI_AGENT: "zhiwei-sdk-rpc-client-messages-probe",
      CI: process.env.CI ?? "true",
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS ?? "true",
    },
    provider: SDK_RPC_PARITY_PROVIDER_ID,
    model: SDK_RPC_PARITY_MODEL_ID,
    args: [
      "--no-session",
      "--no-tools",
      "--no-extensions",
      "--extension",
      extensionPath,
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--offline",
      "--approve",
      "--thinking",
      "off",
    ],
  });

  stage = "rpc-client:start";
  await client.start();
  // The published declaration marks `process` private. The probe intentionally
  // instruments the corresponding published JavaScript field so shutdown
  // transport stays observed evidence instead of a host-authored literal.
  const instrumentedProcess = client.process;
  requireValue(
    instrumentedProcess &&
      typeof instrumentedProcess.once === "function" &&
      typeof instrumentedProcess.kill === "function",
    "Published RpcClient process field is unavailable for shutdown instrumentation.",
  );
  const processTermination = observeProcessTermination(instrumentedProcess);
  const processBoundaries = [];
  const processExit = new Promise((resolveBoundary, reject) => {
    instrumentedProcess.once("error", reject);
    instrumentedProcess.once("exit", (code, signal) => {
      const boundary = {
        sequence: processBoundaries.length + 1,
        type: "exit",
        code,
        signal,
        extensionShutdownRunIdentityMatched:
          hasMatchingDurableExtensionShutdownEvidence(extensionEvidencePath, runIdentity),
      };
      processBoundaries.push(boundary);
      resolveBoundary(boundary);
    });
  });
  const processClose = new Promise((resolveBoundary, reject) => {
    instrumentedProcess.once("error", reject);
    instrumentedProcess.once("close", (code, signal) => {
      const boundary = {
        sequence: processBoundaries.length + 1,
        type: "close",
        code,
        signal,
        extensionShutdownRunIdentityMatched:
          hasMatchingDurableExtensionShutdownEvidence(extensionEvidencePath, runIdentity),
      };
      processBoundaries.push(boundary);
      resolveBoundary(boundary);
    });
  });
  const processBoundaryResult = Promise.all([processExit, processClose]).then(
    (boundaries) => ({ boundaries }),
    (error) => ({ error }),
  );
  requireValue(
    instrumentedProcess.exitCode === null && instrumentedProcess.signalCode === null,
    "RpcClient Worker exited before shutdown instrumentation attached.",
  );
  const requestedSignals = [];
  const hadOwnKill = Object.hasOwn(instrumentedProcess, "kill");
  const originalKillDescriptor = Object.getOwnPropertyDescriptor(instrumentedProcess, "kill");
  const originalKill = instrumentedProcess.kill;
  instrumentedProcess.kill = function instrumentedKill(signal) {
    const request = { signal: signal ?? "SIGTERM" };
    requestedSignals.push(request);
    try {
      request.accepted = originalKill.call(this, signal);
      return request.accepted;
    } catch (error) {
      request.threw = true;
      throw error;
    }
  };

  let stateBefore;
  let messagesBefore;
  let stateAfterAcceptance;
  let events;
  let stateAfter;
  let messagesAfter;
  let lastTextAfter;
  let eventsCollection;
  try {
    stage = "rpc-client:before";
    const [stateBeforeRaw, messagesBeforeRaw] = await Promise.all([
      client.getState(),
      client.getMessages(),
    ]);
    stateBefore = sanitizeState(stateBeforeRaw);
    messagesBefore = messagesBeforeRaw.map((message, index) => messageSummary(message, index));

    stage = "rpc-client:prompt";
    eventsCollection = collectEventsWithoutKeepingProbeAlive(client, 30_000);
    await client.prompt(SDK_RPC_PARITY_PROMPT);
    stateAfterAcceptance = sanitizeState(await client.getState());
    const eventsResult = await waitForOperationOrProcessTermination(
      eventsCollection.resultPromise,
      processTermination.resultPromise,
      "agent_settled",
    );
    if (eventsResult.error) throw eventsResult.error;
    events = eventsResult.collectedEvents.map((event, index) =>
      sanitizeEvent(event, index + 1),
    );

    stage = "rpc-client:after";
    const [stateAfterRaw, messagesAfterRaw, lastTextAfterRaw] = await Promise.all([
      client.getState(),
      client.getMessages(),
      client.getLastAssistantText(),
    ]);
    stateAfter = sanitizeState(stateAfterRaw);
    messagesAfter = messagesAfterRaw.map((message, index) => messageSummary(message, index));
    lastTextAfter = textSummary(lastTextAfterRaw);

    stage = "rpc-client:stop";
    await client.stop();
  } finally {
    eventsCollection?.dispose();
    processTermination.dispose();
    if (hadOwnKill) {
      Object.defineProperty(instrumentedProcess, "kill", originalKillDescriptor);
    } else {
      delete instrumentedProcess.kill;
    }
  }
  let stopTimeout;
  let boundaryResult;
  try {
    boundaryResult = await Promise.race([
      processBoundaryResult,
      new Promise((_, reject) => {
        stopTimeout = setTimeout(
          () => {
            try {
              instrumentedProcess.kill("SIGKILL");
            } catch {
              // Preserve the boundary timeout.
            }
            instrumentedProcess.stdin?.destroy();
            instrumentedProcess.stdout?.destroy();
            instrumentedProcess.stderr?.destroy();
            instrumentedProcess.unref();
            reject(new Error("RpcClient Worker did not close after stop()."));
          },
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(stopTimeout);
  }
  if (boundaryResult.error) throw boundaryResult.error;
  const [exit, close] = boundaryResult.boundaries;
  const stderr = client.getStderr();
  client = undefined;

  requireValue(
    existsSync(extensionEvidencePath),
    "RpcClient Extension evidence was not durable after stop().",
  );
  const rawExtensionEvidence = JSON.parse(await readFile(extensionEvidencePath, "utf8"));
  requireValue(
    rawExtensionEvidence?.runIdentity === runIdentity,
    "RpcClient Extension evidence did not match the current run identity.",
  );
  const { runIdentity: observedRunIdentity, ...extensionEvidenceWithoutRunIdentity } =
    rawExtensionEvidence;
  const extensionEvidence = {
    ...extensionEvidenceWithoutRunIdentity,
    runIdentityMatched: observedRunIdentity === runIdentity,
  };

  const eventTypes = events.map((event) => event.type);
  requireValue(
    stateBefore.isStreaming === false && stateBefore.messageCount === 0,
    "RpcClient initial State must be empty and not streaming.",
  );
  requireValue(messagesBefore.length === 0, "RpcClient getMessages() before Prompt must return [].");
  requireValue(
    stateAfterAcceptance.isStreaming === true && stateAfterAcceptance.messageCount === 1,
    "RpcClient State after Prompt acceptance must observe the running boundary.",
  );
  requireValue(eventTypes.includes("agent_start"), "RpcClient event stream is missing agent_start.");
  requireValue(eventTypes.includes("agent_settled"), "RpcClient event stream is missing agent_settled.");
  requireValue(
    stateAfter.isStreaming === false &&
      stateAfter.messageCount === 2 &&
      stateAfter.pendingMessageCount === 0,
    "RpcClient final State must be settled with two Messages.",
  );
  requireValue(
    JSON.stringify(messagesAfter.map((message) => message.role)) ===
      JSON.stringify(["user", "assistant"]),
    "RpcClient getMessages() after Prompt must return user → assistant.",
  );
  requireValue(lastTextAfter?.matchesExpected === true, "RpcClient final Assistant text drifted.");
  requireValue(stderr.length === 0, "RpcClient wrote unexpected stderr.");
  requireValue(
    JSON.stringify(requestedSignals) ===
      JSON.stringify([{ signal: "SIGTERM", accepted: true }]),
    "RpcClient.stop() signal requests drifted or reached the SIGKILL fallback.",
  );
  requireValue(
    exit.code === 143 && exit.signal === null,
    "RpcClient Worker exit boundary must be the handled SIGTERM exit code 143.",
  );
  requireValue(
    close.code === 143 && close.signal === null,
    "RpcClient Worker close boundary must be the handled SIGTERM exit code 143.",
  );
  requireValue(
    exit.extensionShutdownRunIdentityMatched === true &&
      close.extensionShutdownRunIdentityMatched === true,
    "Current-run RpcClient Extension shutdown evidence must be durable before exit and close.",
  );
  const exitBeforeClose =
    processBoundaries.findIndex((boundary) => boundary.type === "exit") >= 0 &&
    processBoundaries.findIndex((boundary) => boundary.type === "close") >
      processBoundaries.findIndex((boundary) => boundary.type === "exit");
  requireValue(
    exitBeforeClose,
    "RpcClient Worker exit/close ordering drifted.",
  );
  requireValue(
    extensionEvidence?.runIdentityMatched === true &&
      extensionEvidence?.provider?.callCount === 1 &&
      extensionEvidence?.provider?.pendingResponses === 0 &&
      extensionEvidence?.provider?.promptsSentToExternalProvider === 0,
    "RpcClient Faux Provider evidence drifted.",
  );

  return {
    clientSurface: "published-RpcClient",
    before: {
      state: stateBefore,
      messages: messagesBefore,
    },
    acceptance: {
      promptReturned: true,
      state: stateAfterAcceptance,
    },
    after: {
      state: stateAfter,
      messages: messagesAfter,
      lastAssistantText: lastTextAfter,
    },
    events,
    extensionEvidence,
    shutdown: {
      mechanism: "RpcClient.stop",
      instrumentationSurface: "published-js-private-process-field",
      requestedSignals,
      process: {
        processBoundaries,
      },
      stderrPresent: stderr.length > 0,
      stderrLength: stderr.length,
      stderrSha256: sha256(stderr),
    },
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      rawStderrIncluded: false,
    },
  };
}

async function run() {
  if (
    (process.env.PI_LIFECYCLE_SCENARIO ?? SDK_RPC_PARITY_SCENARIO) !==
    SDK_RPC_PARITY_SCENARIO
  ) {
    throw new Error(
      `Unexpected lifecycle scenario: ${process.env.PI_LIFECYCLE_SCENARIO ?? "<missing>"}`,
    );
  }
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(agentDir, { recursive: true }),
  ]);

  const primaryOutput = runPrimaryCapture();
  primary = JSON.parse(await readFile(primaryOutput, "utf8"));
  requireValue(primary.status === "passed", "Primary SDK/RPC parity capture did not pass.");

  const rpcClientMessages = await captureRpcClientMessages();
  primary.contract.rpcClientMessagesBoundary = {
    client: "published-RpcClient",
    command: "get_messages",
    phases: ["before-prompt", "after-settled"],
  };
  primary.cases.rpcClientMessages = rpcClientMessages;
  primary.comparison.rpcClientMessagesBeforeEmpty =
    rpcClientMessages.before.messages.length === 0;
  primary.comparison.rpcClientMessagesAfterMatchPrimary =
    JSON.stringify(rpcClientMessages.after.messages.map((message) => message.role)) ===
      JSON.stringify(primary.cases.rpc.messagesAfter.map((message) => message.role)) &&
    rpcClientMessages.after.lastAssistantText?.sha256 ===
      primary.cases.rpc.lastTextAfter?.sha256;
  primary.comparison.rpcClientAcceptanceStateObserved =
    rpcClientMessages.acceptance.state.isStreaming === true;

  delete primary.contractFingerprint;
  await persist(primary);
  await rm(primaryOutput, { force: true });
  process.stdout.write(`${JSON.stringify(primary)}\n`);
}

try {
  await run();
} catch (error) {
  try {
    await client?.stop();
  } catch {
    // Preserve the original failure.
  }
  const failure = {
    schemaVersion: SDK_RPC_PARITY_SCHEMA_VERSION,
    status: "failed",
    scenario: SDK_RPC_PARITY_SCENARIO,
    error: normalizeError(error),
    completed: primary ? { primary } : {},
    sanitization: {
      absolutePathsIncluded: false,
      rawSessionIdIncluded: false,
      rawSessionFileIncluded: false,
      environmentDumpIncluded: false,
      credentialsIncluded: false,
      rawChainOfThoughtIncluded: false,
      rawStderrIncluded: false,
    },
  };
  await persist(failure);
  console.error(`Pi SDK/RPC composite capture failed at ${stage}: ${failure.error.message}`);
  process.exitCode = 1;
}
