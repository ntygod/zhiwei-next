import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureDir, "../../../../");
const basePath = join(fixtureDir, "rpc-worker-lifecycle-legacy-checker-base.mjs");
const contractPath = join(repositoryRoot, "scripts/probes/pi-sdk-rpc-parity-contract.mjs");
const parityFixturePath = join(repositoryRoot, "scripts/pi-sdk-rpc-parity-fixture.mjs");
const BASE_CHECKER_GIT_BLOB_SHA = "86f3ddbc1ae7ac045c63f7bd830e077acb064d20";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function gitBlobSha(text) {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  requireValue(first >= 0, `Legacy checker base is missing ${label}.`);
  requireValue(
    source.indexOf(before, first + before.length) === -1,
    `Legacy checker base contains duplicate ${label}.`,
  );
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function relocateLegacyCheckerSource(baseSource) {
  requireValue(
    gitBlobSha(baseSource) === BASE_CHECKER_GIT_BLOB_SHA,
    "Legacy checker base Git blob identity drifted.",
  );
  let source = replaceExactlyOnce(
    baseSource,
    '"./probes/pi-sdk-rpc-parity-contract.mjs"',
    JSON.stringify(pathToFileURL(contractPath).href),
    "contract import",
  );
  source = replaceExactlyOnce(
    source,
    '"./pi-sdk-rpc-parity-fixture.mjs"',
    JSON.stringify(pathToFileURL(parityFixturePath).href),
    "fixture import",
  );
  return source;
}

async function main() {
  const source = relocateLegacyCheckerSource(await readFile(basePath, "utf8"));
  const verifyTransform = process.argv.includes("--verify-transform");
  const tempRoot = await mkdtemp(join(tmpdir(), "zhiwei-rpc-worker-legacy-checker-"));
  const checkerPath = join(tempRoot, "checker.mjs");
  try {
    await writeFile(checkerPath, source, { flag: "wx", mode: 0o400 });
    const childArgs = verifyTransform
      ? ["--check", checkerPath]
      : [checkerPath, ...process.argv.slice(2)];
    const child = spawn(process.execPath, childArgs, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    });
    const result = await new Promise((resolveChild, rejectChild) => {
      child.once("error", rejectChild);
      child.once("close", (code, signal) => resolveChild({ code, signal }));
    });
    requireValue(
      result.code === 0 && result.signal === null,
      `Relocated legacy checker closed with code=${result.code ?? "null"}, signal=${
        result.signal ?? "null"
      }.`,
    );
    if (verifyTransform) {
      console.log("Relocated legacy SDK/RPC checker source: syntax OK");
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Legacy SDK/RPC checker launcher failed: ${error.message}`);
  process.exitCode = 1;
}
