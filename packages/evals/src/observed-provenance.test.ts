import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { observeScenarioProvenance, requireUnchangedScenarioSource } from "./observed-provenance.ts";
import { runScenarioSuite } from "./scenario-runner.ts";

// Synthetic repository only; never change the real checkout during tests.
test("G-4 observes exact git identity and rejects tracked/untracked dirt and changed HEAD", async () => {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-g4-source-"));
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (): void => {
    git("add", ".");
    git("-c", "user.name=G4 Synthetic Test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "synthetic fixture");
  };
  try {
    git("init");
    writeFileSync(join(root, "fixture.ts"), "export const value = 1;\n");
    commit();
    const clean = observeScenarioProvenance(root);
    assert.equal(clean.source.kind, "observed-git");
    assert.equal(clean.source.clean, true);
    assert.equal(clean.source.head, git("rev-parse", "HEAD"));
    assert.equal(clean.source.tree, git("rev-parse", "HEAD^{tree}"));
    assert.equal(clean.environment.node, process.versions.node);
    assert.equal(clean.environment.sqlite, process.versions.sqlite);
    requireUnchangedScenarioSource(clean, observeScenarioProvenance(root));
    for (const file of ["fixture.ts", "untracked-scenario.ts"]) {
      writeFileSync(join(root, file), "export const value = 2;\n");
      const dirty = observeScenarioProvenance(root);
      assert.equal(dirty.source.clean, false);
      assert.throws(() => requireUnchangedScenarioSource(clean, dirty), /changed/);
      await assert.rejects(runScenarioSuite(dirty, { execute: async () => { throw new Error("must not run"); } }), /Uncommitted/);
      if (file === "fixture.ts") git("restore", "fixture.ts");
      else rmSync(join(root, file));
    }
    for (const flag of ["assume-unchanged", "skip-worktree"]) {
      git("update-index", `--${flag}`, "fixture.ts");
      writeFileSync(join(root, "fixture.ts"), "export const hiddenDrift = true;\n");
      assert.equal(git("status", "--porcelain"), "", "Git hides the tracked drift in this attack");
      const hidden = observeScenarioProvenance(root);
      assert.equal(hidden.source.clean, false, "actual bytes still reject hidden drift");
      await assert.rejects(runScenarioSuite(hidden, { execute: async () => undefined }), /Uncommitted/);
      git("update-index", `--no-${flag}`, "fixture.ts");
      git("restore", "fixture.ts");
    }
    assert.equal(observeScenarioProvenance(root).source.clean, true);
    writeFileSync(join(root, "fixture.ts"), "export const value = 3;\n");
    commit();
    const next = observeScenarioProvenance(root);
    assert.equal(next.source.clean, true);
    assert.notEqual(next.source.head, clean.source.head);
    assert.throws(() => requireUnchangedScenarioSource(clean, next), /changed/);
    assert.throws(() => requireUnchangedScenarioSource({ ...clean, source: { ...clean.source, kind: "fixture" } }, clean));
    const safe = JSON.stringify(clean);
    assert.ok(!safe.includes(root));
    assert.ok(!safe.includes("HOME"));
    assert.ok(!safe.includes("PATH"));
    assert.ok(!safe.includes("synthetic@example.invalid"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
