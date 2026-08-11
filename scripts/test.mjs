import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const roots = ["apps", "packages"];
const tests = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      tests.push(path);
    }
  }
}

for (const root of roots) {
  await walk(root);
}

tests.sort();

if (tests.length === 0) {
  console.error("No test files found.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...tests],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
