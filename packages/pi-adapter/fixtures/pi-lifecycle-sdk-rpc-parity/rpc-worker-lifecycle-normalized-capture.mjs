import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeRpcWorkerCapture } from "./rpc-worker-lifecycle-normalizer.mjs";

const rawCapturePath = fileURLToPath(
  new URL(
    "../../../../scripts/probes/pi-sdk-rpc-parity-faux-extension.mjs",
    import.meta.url,
  ),
);
const outputPath = resolveRequiredPath("PI_LIFECYCLE_OUTPUT");
const RAW_CAPTURE_TIMEOUT_MS = 150_000;
const MAX_DIAGNOSTIC_BYTES = 256 * 1024;

function resolveRequiredPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return resolve(value);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function appendDiagnostic(current, chunk) {
  const combined = Buffer.concat([current, chunk]);
  return combined.length <= MAX_DIAGNOSTIC_BYTES
    ? combined
    : combined.subarray(combined.length - MAX_DIAGNOSTIC_BYTES);
}

async function runRawCapture() {
  const child = spawn(process.execPath, [rawCapturePath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = Buffer.alloc(0);
  child.stderr.on("data", (chunk) => {
    stderr = appendDiagnostic(stderr, chunk);
  });

  return new Promise((resolveRun, rejectRun) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Preserve timeout as the primary failure.
      }
      finish(() =>
        rejectRun(
          new Error(`Raw RPC Worker capture exceeded ${RAW_CAPTURE_TIMEOUT_MS}ms.`),
        ),
      );
    }, RAW_CAPTURE_TIMEOUT_MS);
    timer.unref?.();

    child.once("error", (error) => finish(() => rejectRun(error)));
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
}

await runRawCapture();
const rawCapture = JSON.parse(await readFile(outputPath, "utf8"));
requireValue(
  rawCapture?.scenario === "rpc-worker-lifecycle",
  "Raw capture scenario must be rpc-worker-lifecycle.",
);
const normalized = normalizeRpcWorkerCapture(rawCapture);
await writeFile(outputPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(normalized)}\n`);
