import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";

export const DEFAULT_SDK_RPC_PARITY_MANIFEST =
  "packages/pi-adapter/fixtures/pi-lifecycle-sdk-rpc-parity/manifest.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export async function readSdkRpcParityFixture(
  manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST,
) {
  const absoluteManifestPath = resolve(manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifestPath, "utf8"));
  requireValue(manifest.schemaVersion === 1, "SDK/RPC Fixture manifest schemaVersion must be 1.");
  requireValue(
    manifest.format === "gzip+base64-parts",
    "SDK/RPC Fixture manifest format must be gzip+base64-parts.",
  );
  requireValue(
    Array.isArray(manifest.parts) && manifest.parts.length > 0,
    "SDK/RPC Fixture manifest must list at least one part.",
  );
  requireValue(
    new Set(manifest.parts).size === manifest.parts.length,
    "SDK/RPC Fixture manifest contains duplicate part names.",
  );

  const baseDir = dirname(absoluteManifestPath);
  const partContents = await Promise.all(
    manifest.parts.map(async (partName, index) => {
      requireValue(
        /^part-\d{2}\.b64$/.test(partName),
        `SDK/RPC Fixture part name is invalid: ${partName}.`,
      );
      const content = await readFile(join(baseDir, partName), "utf8");
      requireValue(
        /^[A-Za-z0-9+/]*={0,2}$/.test(content),
        `SDK/RPC Fixture part ${partName} is not canonical base64 text.`,
      );
      if (index < manifest.parts.length - 1) {
        requireValue(
          content.length === manifest.partLength,
          `SDK/RPC Fixture part ${partName} length drifted.`,
        );
      } else {
        requireValue(
          content.length > 0 && content.length <= manifest.partLength,
          `SDK/RPC Fixture final part ${partName} length drifted.`,
        );
      }
      return content;
    }),
  );

  const base64 = partContents.join("");
  requireValue(
    base64.length === manifest.base64Length,
    "SDK/RPC Fixture base64 length differs from the manifest.",
  );
  const compressed = Buffer.from(base64, "base64");
  requireValue(
    compressed.length === manifest.compressedBytes,
    "SDK/RPC Fixture compressed byte length differs from the manifest.",
  );
  requireValue(
    sha256(compressed) === manifest.compressedSha256,
    "SDK/RPC Fixture compressed SHA-256 differs from the manifest.",
  );

  const jsonBytes = gunzipSync(compressed);
  requireValue(
    jsonBytes.length === manifest.jsonBytes,
    "SDK/RPC Fixture JSON byte length differs from the manifest.",
  );
  requireValue(
    sha256(jsonBytes) === manifest.jsonSha256,
    "SDK/RPC Fixture JSON SHA-256 differs from the manifest.",
  );
  const result = JSON.parse(jsonBytes.toString("utf8"));
  requireValue(
    result.contractFingerprint === manifest.outerContractFingerprint,
    "SDK/RPC Fixture outer fingerprint differs from the manifest.",
  );
  requireValue(
    result.capture?.contractFingerprint === manifest.captureContractFingerprint,
    "SDK/RPC Fixture nested capture fingerprint differs from the manifest.",
  );
  return { manifest, result, jsonBytes };
}

async function runCli() {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_SDK_RPC_PARITY_MANIFEST;
  let outputPath;
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") {
      manifestPath = args[++index];
    } else if (argument === "--output") {
      outputPath = args[++index];
    } else if (argument === "--check") {
      check = true;
    } else {
      throw new Error(`Unknown SDK/RPC Fixture argument: ${argument}`);
    }
  }
  requireValue(Boolean(outputPath) || check, "Use --output <path>, --check, or both.");

  const { manifest, jsonBytes } = await readSdkRpcParityFixture(manifestPath);
  let temporaryDirectory;
  let materializedPath = outputPath ? resolve(outputPath) : undefined;
  try {
    if (!materializedPath && check) {
      temporaryDirectory = await mkdtemp(join(tmpdir(), "zhiwei-sdk-rpc-parity-"));
      materializedPath = join(temporaryDirectory, "result.json");
    }
    if (materializedPath) {
      await writeFile(materializedPath, jsonBytes);
    }
    if (check) {
      const checker = spawnSync(
        process.execPath,
        ["scripts/check-pi-sdk-rpc-parity-result.mjs", materializedPath],
        { stdio: "inherit" },
      );
      if (checker.error) throw checker.error;
      if (checker.status !== 0) {
        throw new Error(`SDK/RPC parity checker exited with status ${checker.status}.`);
      }
    }
    console.log(
      `SDK/RPC parity Fixture: OK (${manifest.jsonBytes} JSON bytes, ${manifest.compressedBytes} compressed bytes)`,
    );
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
