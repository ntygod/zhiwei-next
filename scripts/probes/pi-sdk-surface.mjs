import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const baselineUrl = new URL("../../packages/pi-adapter/fixtures/pi-upstream-baseline.json", import.meta.url);
const baseline = JSON.parse(await readFile(baselineUrl, "utf8"));

function versionTuple(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) throw new Error(`Unable to parse Node.js version: ${value}`);
  return match.slice(1).map(Number);
}

function atLeast(current, minimum) {
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > minimum[index]) return true;
    if (current[index] < minimum[index]) return false;
  }
  return true;
}

function resolveRootExport(manifest) {
  const root = manifest.exports?.["."];
  if (typeof root === "string") return root;
  if (root && typeof root.import === "string") return root.import;
  if (root && typeof root.default === "string") return root.default;
  if (typeof manifest.main === "string") return manifest.main;
  throw new Error("Published Pi package does not expose a resolvable root ESM entry.");
}

const requiredNode = [22, 19, 0];
const currentNode = versionTuple(process.versions.node);
if (!atLeast(currentNode, requiredNode)) {
  throw new Error(
    `Pi ${baseline.package.version} requires Node ${baseline.package.nodeEngine}; current runtime is ${process.versions.node}.`,
  );
}

const isolatedPackageDir = process.env.PI_PACKAGE_DIR ? resolve(process.env.PI_PACKAGE_DIR) : undefined;
let importTarget = baseline.package.name;
let packageSource = "node-resolution";

if (isolatedPackageDir) {
  const manifest = JSON.parse(await readFile(join(isolatedPackageDir, "package.json"), "utf8"));
  if (manifest.name !== baseline.package.name || manifest.version !== baseline.package.version) {
    throw new Error(
      `Isolated package mismatch: expected ${baseline.package.name}@${baseline.package.version}, received ${manifest.name}@${manifest.version}.`,
    );
  }
  importTarget = pathToFileURL(join(isolatedPackageDir, resolveRootExport(manifest))).href;
  packageSource = "isolated-package-dir";
}

let pi;
try {
  pi = await import(importTarget);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Unable to import ${baseline.package.name}@${baseline.package.version}. Run the exact isolated install command recorded in the spike first. Cause: ${message}`,
  );
}

const requiredExports = [
  "createAgentSession",
  "createAgentSessionRuntime",
  "SessionManager",
  "ModelRuntime",
];

const missing = requiredExports.filter((name) => !(name in pi));
if (missing.length > 0) {
  throw new Error(`Published Pi SDK is missing expected exports: ${missing.join(", ")}`);
}
if (typeof pi.SessionManager?.inMemory !== "function") {
  throw new Error("SessionManager.inMemory is not available.");
}
if (typeof pi.ModelRuntime?.create !== "function") {
  throw new Error("ModelRuntime.create is not available.");
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      package: `${baseline.package.name}@${baseline.package.version}`,
      node: process.versions.node,
      packageSource,
      exports: requiredExports,
      credentialsUsed: false,
    },
    null,
    2,
  ),
);
