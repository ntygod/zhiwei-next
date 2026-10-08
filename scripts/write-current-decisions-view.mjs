import assert from "node:assert/strict";
import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, basename, parse, resolve, sep } from "node:path";
import { VIEW_PATH } from "./current-decisions.mjs";

function optionalStat(io, path) {
  try { return io.lstatSync(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function sameFile(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }
function inspectDestination(root, io) {
  const target = resolve(root, VIEW_PATH);
  const parent = dirname(target);
  const directories = [];
  let path = parse(parent).root;
  for (const part of parent.slice(path.length).split(sep)) {
    path = resolve(path, part);
    const stat = io.lstatSync(path);
    assert.ok(!stat.isSymbolicLink() && stat.isDirectory(), `Unsafe output parent: ${path}`);
    directories.push({ path, stat });
  }
  const targetStat = optionalStat(io, target);
  if (targetStat) {
    assert.ok(!targetStat.isSymbolicLink() && targetStat.isFile(), `Unsafe output target: ${target}`);
    assert.equal(targetStat.nlink, 1, "Output target must not be a hard link");
  }
  return { target, parent, directories, targetStat };
}

// Only writes the fixed generated view. This is not a generic path-writing API.
// Atomic replacement never opens/truncates the old target; linked targets fail closed.
export function writeCurrentDecisionsView(root, content, io = fs) {
  assert.equal(typeof content, "string");
  assert.ok(Number.isInteger(fs.constants.O_NOFOLLOW), "Safe view generation requires O_NOFOLLOW support");
  const before = inspectDestination(root, io);
  const temporary = resolve(before.parent, `.${basename(before.target)}.${randomBytes(16).toString("hex")}.tmp`);
  let fd = null;
  let created = false;
  let renamed = false;
  let failure = null;
  try {
    fd = io.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o644);
    created = true;
    const opened = io.fstatSync(fd);
    assert.ok(opened.isFile() && opened.nlink === 1, "Temporary output must be a private regular file");
    io.writeFileSync(fd, content, { encoding: "utf8" });
    io.fsyncSync(fd);
    const after = inspectDestination(root, io);
    assert.equal(after.directories.length, before.directories.length);
    assert.ok(after.directories.every((entry, index) => sameFile(entry.stat, before.directories[index].stat)), "Output parent changed during generation");
    assert.ok(sameFile(before.targetStat, after.targetStat), "Output target changed during generation");
    if (before.targetStat) {
      assert.equal(after.targetStat.size, before.targetStat.size, "Output target changed during generation");
      assert.equal(after.targetStat.mtimeMs, before.targetStat.mtimeMs, "Output target changed during generation");
    }
    const staged = io.lstatSync(temporary);
    assert.ok(!staged.isSymbolicLink() && staged.isFile() && staged.nlink === 1 && sameFile(opened, staged), "Temporary output identity changed");
    io.closeSync(fd); fd = null;
    io.renameSync(temporary, before.target);
    renamed = true;
  } catch (error) { failure = error; }
  finally {
    const errors = failure ? [failure] : [];
    if (fd !== null) { try { io.closeSync(fd); } catch (error) { errors.push(error); } }
    if (created && !renamed) { try { io.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") errors.push(error); } }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "View generation failed; inspect reported cleanup errors");
  }
}
