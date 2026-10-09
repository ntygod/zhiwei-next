import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../", import.meta.url));

test("G-4 real CLI binds clean observed HEAD/environment; rejects dirty/untracked source and unknown scenarios", () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-g4-cli-"));
  const copy = (relative: string): void => {
    const destination = join(root, relative);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(repository, relative), destination, { recursive: true });
  };
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const run = (...args: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", join(root, "scripts/run-scenarios.mjs"), ...args], {
    cwd: root, encoding: "utf8", timeout: 20_000,
  });
  try {
    for (const path of ["package.json", "package-lock.json", "toolchain.json", ".node-version", "scripts/run-scenarios.mjs", "scripts/check-toolchain.mjs", "packages/pi-adapter/fixtures/pi-upstream-baseline.json"]) copy(path);
    for (const name of ["evals", "domain", "protocol", "memory-store"]) copy(`packages/${name}/src`);
    copy("packages/memory-store/migrations");
    writeFileSync(join(root, ".gitignore"), "node_modules\n");
    symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "dir");
    git("init"); git("add", ".");
    git("-c", "user.name=G4 Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "synthetic CLI fixture");
    const success = run("E0-02");
    assert.equal(success.status, 0, success.stderr);
    const report: unknown = JSON.parse(success.stdout);
    assert.ok(report && typeof report === "object");
    assert.ok("source" in report && "environment" in report && "toolchain" in report && "totals" in report);
    assert.deepEqual(report.source, { kind: "observed-git", head: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), clean: true });
    assert.deepEqual(report.environment, { node: process.versions.node, platform: process.platform, arch: process.arch, sqlite: process.versions.sqlite, isolation: "child-process-synthetic-temp-sqlite" });
    assert.deepEqual(report.toolchain, { npm: "10.9.8", typescript: "5.9.3", nodeTypes: "22.19.19", pi: "0.84.1" });
    assert.deepEqual(report.totals, { passed: 1, failed: 0, skipped: 0, "not-run": 23 });
    for (const id of ["E0-99", "S0-12"]) {
      const rejected = run(id);
      assert.equal(rejected.status, 2);
      assert.equal(rejected.stdout, "");
    }
    writeFileSync(join(root, ".git/info/exclude"), "packages/evals/src/ignored-scenario.ts\n");
    writeFileSync(join(root, "packages/evals/src/ignored-scenario.ts"), "export const ignored = true;\n");
    assert.equal(git("status", "--porcelain"), "", "Git ignores the newly added source file");
    const ignored = run("E0-02");
    assert.equal(ignored.status, 2);
    assert.equal(ignored.stdout, "");
    rmSync(join(root, "packages/evals/src/ignored-scenario.ts"));
    const existing = join(root, "packages/evals/src/catalog.ts");
    writeFileSync(existing, `${readFileSync(existing, "utf8")}\n// uncommitted change\n`);
    const dirty = run("E0-02");
    assert.equal(dirty.status, 2);
    assert.equal(dirty.stdout, "");
    git("restore", "packages/evals/src/catalog.ts");
    writeFileSync(join(root, "untracked-source.ts"), "export const uncommitted = true;\n");
    const untracked = run("E0-02");
    assert.equal(untracked.status, 2);
    assert.equal(untracked.stdout, "");
    assert.ok(!untracked.stderr.includes(root), "errors must not leak fixture paths");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
