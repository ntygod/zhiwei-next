import { readFile } from "node:fs/promises";

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

const requiredNode = [22, 19, 0];
const currentNode = versionTuple(process.versions.node);
if (!atLeast(currentNode, requiredNode)) {
  throw new Error(
    `Pi ${baseline.package.version} requires Node ${baseline.package.nodeEngine}; current runtime is ${process.versions.node}.`,
  );
}

let pi;
try {
  pi = await import(baseline.package.name);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Unable to import ${baseline.package.name}@${baseline.package.version}. Run the exact npm install command recorded in the spike first. Cause: ${message}`,
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
      exports: requiredExports,
      credentialsUsed: false,
    },
    null,
    2,
  ),
);
