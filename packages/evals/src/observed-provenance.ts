import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { RunnerProvenance } from "./scenario-runner.ts";

// Never read/dump process.env, home paths, credentials, hostnames, or Git remotes.
// Caller-supplied fixture metadata uses kind=fixture; CLI only calls this observer.
export function observeScenarioProvenance(root: string, requiredSourceRoots: readonly string[] = []): RunnerProvenance {
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const head = git("rev-parse", "HEAD");
  // status alone trusts index flags (assume-unchanged/skip-worktree). Compare
  // every tracked file's actual Git blob identity and mode to this exact HEAD.
  const entries = git("ls-tree", "-rz", "--full-tree", head).split("\0").filter(Boolean);
  const trackedPaths = new Set(entries.map(entry => entry.slice(entry.indexOf("\t") + 1)));
  const requiredSourcesTracked = (relative: string): boolean => {
    try {
      const stat = lstatSync(join(root, relative));
      if (stat.isDirectory()) return readdirSync(join(root, relative)).every(name => requiredSourcesTracked(join(relative, name)));
      return stat.isFile() && trackedPaths.has(relative);
    } catch { return false; }
  };
  const trackedContentMatches = entries.every(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s.exec(entry);
    if (!match) return false; // no unverified symlink/submodule source boundary
    const [, mode, expected, relative] = match;
    if (!relative) return false;
    try {
      const path = join(root, relative);
      const stat = lstatSync(path);
      if (!stat.isFile() || ((stat.mode & 0o111) !== 0) !== (mode === "100755")) return false;
      const bytes = readFileSync(path);
      const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      return actual === expected;
    } catch { return false; }
  });
  return {
    source: {
      kind: "observed-git", head, tree: git("rev-parse", `${head}^{tree}`),
      clean: trackedContentMatches && requiredSourceRoots.every(requiredSourcesTracked) && git("status", "--porcelain", "--untracked-files=all").length === 0,
    },
    environment: {
      node: process.versions.node, platform: process.platform, arch: process.arch,
      sqlite: process.versions.sqlite ?? "unavailable", isolation: "child-process-synthetic-temp-sqlite",
    },
  };
}

export function observeToolchainVersions(root: string): Readonly<Record<string, string>> {
  const version = (name: string): string => {
    const path = join(root, "node_modules", name, "package.json");
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!data || typeof data !== "object" || !("version" in data) || typeof data.version !== "string") throw new Error("Invalid package version");
    return data.version;
  };
  const npm = execFileSync("npm", ["--version"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5_000, maxBuffer: 1_024 }).trim();
  if (!/^\d+\.\d+\.\d+$/.test(npm)) throw new Error("Invalid npm version output");
  return { npm, typescript: version("typescript"), nodeTypes: version("@types/node"), pi: version("@earendil-works/pi-coding-agent") };
}

export function requireUnchangedScenarioSource(before: RunnerProvenance, after: RunnerProvenance): void {
  assert.equal(before.source.kind, "observed-git");
  assert.equal(before.source.clean, true, "Uncommitted source cannot bind execution to HEAD");
  assert.deepEqual(after, before, "Source or environment changed during execution");
}
