import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { RunnerProvenance } from "./scenario-runner.ts";

// Never read/dump process.env, home paths, credentials, hostnames, or Git remotes.
// Caller-supplied fixture metadata uses kind=fixture; CLI only calls this observer.
export function observeScenarioProvenance(root: string): RunnerProvenance {
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return {
    source: {
      kind: "observed-git", head: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"),
      clean: git("status", "--porcelain", "--untracked-files=all").length === 0,
    },
    environment: {
      node: process.versions.node, platform: process.platform, arch: process.arch,
      sqlite: process.versions.sqlite ?? "unavailable", isolation: "worker-thread-synthetic-temp-sqlite",
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
  return { typescript: version("typescript"), nodeTypes: version("@types/node"), pi: version("@earendil-works/pi-coding-agent") };
}
