import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawCapturePath = fileURLToPath(
  new URL(
    "../../../../scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs",
    import.meta.url,
  ),
);
const contractSourcePath = fileURLToPath(
  new URL(
    "../../../../scripts/probes/pi-sdk-rpc-parity-contract.mjs",
    import.meta.url,
  ),
);
const outputPath = resolveRequiredPath("PI_LIFECYCLE_OUTPUT");
const RAW_CAPTURE_TIMEOUT_MS = 150_000;
const MAX_DIAGNOSTIC_BYTES = 256 * 1024;
const PROVIDER_ERROR_OBSERVATION_DELAY_MS = 500;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  requireValue(first >= 0, `Raw capture source is missing ${label}.`);
  requireValue(
    source.indexOf(before, first + before.length) === -1,
    `Raw capture source contains duplicate ${label}.`,
  );
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function materializeDeterministicRawCapture() {
  const [rawSource, contractSource] = await Promise.all([
    readFile(rawCapturePath, "utf8"),
    readFile(contractSourcePath, "utf8"),
  ]);

  let patched = replaceExactlyOnce(
    rawSource,
    `  "accepted-provider-error": {\n    provider: RPC_WORKER_ERROR_PROVIDER_ID,\n    api: RPC_WORKER_ERROR_PROVIDER_API_ID,\n    text: "",\n    stopReason: "error",\n    errorMessage: RPC_WORKER_PROVIDER_ERROR_MESSAGE,\n    responseId: "zhiwei-rpc-worker-provider-error-response",\n    timestamp: 3000,\n  },\n`,
    `  "accepted-provider-error": {\n    provider: RPC_WORKER_ERROR_PROVIDER_ID,\n    api: RPC_WORKER_ERROR_PROVIDER_API_ID,\n    text: "",\n    stopReason: "error",\n    errorMessage: RPC_WORKER_PROVIDER_ERROR_MESSAGE,\n    responseId: "zhiwei-rpc-worker-provider-error-response",\n    timestamp: 3000,\n    observationDelayMs: ${PROVIDER_ERROR_OBSERVATION_DELAY_MS},\n  },\n`,
    "accepted Provider-error configuration",
  );

  patched = replaceExactlyOnce(
    patched,
    `  providerHandle.setResponses([\n    fauxAssistantMessage(configuration.text, {\n      stopReason: configuration.stopReason,\n      errorMessage: configuration.errorMessage,\n      responseId: configuration.responseId,\n      timestamp: configuration.timestamp,\n    }),\n  ]);\n`,
    `  const configuredResponse = fauxAssistantMessage(configuration.text, {\n    stopReason: configuration.stopReason,\n    errorMessage: configuration.errorMessage,\n    responseId: configuration.responseId,\n    timestamp: configuration.timestamp,\n  });\n  providerHandle.setResponses([\n    Number.isSafeInteger(configuration.observationDelayMs) &&\n    configuration.observationDelayMs > 0\n      ? async () => {\n          await new Promise((resolveDelay) =>\n            setTimeout(resolveDelay, configuration.observationDelayMs),\n          );\n          return configuredResponse;\n        }\n      : configuredResponse,\n  ]);\n`,
    "RPC Worker Faux response registration",
  );

  const sourceRoot = await mkdtemp(
    join(dirname(outputPath) || tmpdir(), "rpc-worker-deterministic-source-"),
  );
  const capturePath = join(
    sourceRoot,
    "pi-sdk-rpc-parity-faux-extension.mjs",
  );
  await Promise.all([
    writeFile(capturePath, patched, { flag: "wx", mode: 0o600 }),
    writeFile(
      join(sourceRoot, "pi-sdk-rpc-parity-contract.mjs"),
      contractSource,
      { flag: "wx", mode: 0o600 },
    ),
  ]);
  return { capturePath, sourceRoot };
}

function appendDiagnostic(current, chunk) {
  const combined = Buffer.concat([current, chunk]);
  return combined.length <= MAX_DIAGNOSTIC_BYTES
    ? combined
    : combined.subarray(combined.length - MAX_DIAGNOSTIC_BYTES);
}

async function runRawCapture() {
  const { capturePath, sourceRoot } =
    await materializeDeterministicRawCapture();
  try {
    const child = spawn(process.execPath, [capturePath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = Buffer.alloc(0);
    child.stderr.on("data", (chunk) => {
      stderr = appendDiagnostic(stderr, chunk);
    });

    await new Promise((resolveRun, rejectRun) => {
      let settled = false;
      let timer;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };

      timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Preserve the timeout as the primary failure.
        }
        finish(() =>
          rejectRun(
            new Error(
              `Raw RPC Worker capture exceeded ${RAW_CAPTURE_TIMEOUT_MS}ms.`,
            ),
          ),
        );
      }, RAW_CAPTURE_TIMEOUT_MS);
      timer.unref?.();

      child.once("error", (error) =>
        finish(() => rejectRun(error)),
      );
      child.once("close", (code, signal) => {
        finish(() => {
          if (code === 0 && signal === null) {
            resolveRun();
            return;
          }
          const diagnostic = stderr.toString("utf8").trim();
          rejectRun(
            new Error(
              `Raw RPC Worker capture closed with code=${code ?? "null"}, ` +
                `signal=${signal ?? "null"}` +
                (diagnostic ? `: ${diagnostic}` : "."),
            ),
          );
        });
      });
    });
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
  }
}

await runRawCapture();
const resultText = await readFile(outputPath, "utf8");
const result = JSON.parse(resultText);
const providerError = result?.cases?.acceptedProviderError;
requireValue(
  providerError?.stateDuring?.isStreaming === true &&
    providerError.stateDuring.messageCount === 1,
  "Provider-error controlled observation window did not expose running State.",
);
requireValue(
  providerError?.ordering?.promptResponsePrecedesAgentStart === true &&
    providerError.ordering.failureExpressedAfterAcceptance === true &&
    providerError.ordering.stateDuringAfterAcceptanceBeforeSettled === true,
  "Provider-error acceptance, State, and failure ordering drifted.",
);
process.stdout.write(`${JSON.stringify(result)}\n`);
