import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const protectedRoots = [
  "packages/domain",
  "packages/cognition-core",
  "packages/memory-store",
  "packages/context-compiler",
  "packages/protocol",
  "packages/evals",
];

const forbiddenPatterns = [
  /from\s+["'][^"']*pi-adapter[^"']*["']/,
  /from\s+["']@mariozechner\//,
  /from\s+["']pi-coding-agent["']/,
];

const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const content = await readFile(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${relative(process.cwd(), path)} matches ${pattern}`);
      }
    }
  }
}

for (const root of protectedRoots) {
  await walk(root);
}

if (violations.length > 0) {
  console.error("Architecture boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Architecture boundaries: OK");
