import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".cache",
  ".turbo",
]);
const violations = [];
const agentsFiles = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
    } else if (entry.isFile() && entry.name === "AGENTS.md") {
      agentsFiles.push(relative(root, path).split(sep).join("/"));
    }
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

await walk(root);
agentsFiles.sort();

if (!agentsFiles.includes("AGENTS.md")) {
  violations.push("Root AGENTS.md is missing.");
} else {
  const rootContent = await readFile(join(root, "AGENTS.md"), "utf8");
  const indexStart = rootContent.indexOf("## 局部规则索引");
  if (indexStart < 0) {
    violations.push("Root AGENTS.md must contain a '## 局部规则索引' section.");
  } else {
    const tail = rootContent.slice(indexStart + "## 局部规则索引".length);
    const nextHeading = tail.search(/\n##\s+/);
    const indexSection = nextHeading >= 0 ? tail.slice(0, nextHeading) : tail;
    const indexed = [...indexSection.matchAll(/`([^`]+\/AGENTS\.md)`/g)].map((match) => match[1]);
    const indexedSet = new Set(indexed);
    const discovered = agentsFiles.filter((path) => path !== "AGENTS.md");

    for (const path of discovered) {
      if (!indexedSet.has(path)) violations.push(`Local rules file is not indexed in root AGENTS.md: ${path}`);
    }
    for (const path of indexedSet) {
      if (!discovered.includes(path)) violations.push(`Root AGENTS.md indexes a missing local rules file: ${path}`);
    }
    if (indexed.length !== indexedSet.size) {
      violations.push("Root AGENTS.md contains duplicate local rules index entries.");
    }
  }
}

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const scripts = packageJson.scripts ?? {};

for (const relativePath of agentsFiles) {
  const absolutePath = join(root, relativePath);
  const content = await readFile(absolutePath, "utf8");
  const lineCount = content.split(/\r?\n/).length;
  const maxLines = relativePath === "AGENTS.md" ? 230 : 140;
  if (lineCount > maxLines) {
    violations.push(`${relativePath} exceeds the information budget (${lineCount}/${maxLines} lines).`);
  }

  if (!content.startsWith("# ")) {
    violations.push(`${relativePath} must start with a level-one heading.`);
  }

  if (relativePath !== "AGENTS.md") {
    const actionableRules = content
      .split(/\r?\n/)
      .filter((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line)).length;
    if (actionableRules < 3) {
      violations.push(`${relativePath} has fewer than three actionable local rules; merge it into its parent instead.`);
    }
  }

  for (const match of content.matchAll(/npm\s+run\s+([\w:-]+)/g)) {
    const scriptName = match[1];
    if (!(scriptName in scripts)) {
      violations.push(`${relativePath} references missing package script: npm run ${scriptName}`);
    }
  }

  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    const resolved = resolve(dirname(absolutePath), target);
    if (!(await exists(resolved))) {
      violations.push(`${relativePath} contains a broken relative link: ${target}`);
    }
  }
}

if (violations.length > 0) {
  console.error("AGENTS guidance violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`AGENTS guidance: OK (${agentsFiles.length} files)`);
