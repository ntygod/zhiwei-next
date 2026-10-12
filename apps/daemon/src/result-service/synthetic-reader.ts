import { randomUUID } from "node:crypto";
import { constants, closeSync, fstatSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CriterionCheckV1, CriterionObservationPayloadV1 } from "../../../../packages/domain/src/index.ts";
import { canonicalJsonV1 } from "../../../../packages/protocol/src/index.ts";
import type { OutcomeVerificationSnapshotV1 } from "../../../../packages/memory-store/src/index.ts";
import type { OutcomeVerificationReaderV1 } from "./service.ts";
export interface SyntheticOutcomeReaderV1 extends OutcomeVerificationReaderV1 {
  register(workspaceId: string, taskId: string, attemptId: string): void;
  setSample(workspaceId: string, taskId: string, attemptId: string, text: string): void;
  close(): void;
}
/** Owns only fresh fixture files. Resource IDs never become caller paths or commands. */
export function createSyntheticOutcomeReaderV1(): SyntheticOutcomeReaderV1 {
  const root = mkdtempSync(join(tmpdir(), "zhiwei-result-reader-")), samples = new Map<string, { path: string }>();
  let closed = false;
  const key = (workspaceId: string, taskId: string, attemptId: string) => canonicalJsonV1([workspaceId, taskId, attemptId]);
  return {
    preparePlan(plan) { this.register(plan.workspaceId, plan.task.id, plan.taskAttempt.attemptId); },
    register(workspaceId, taskId, attemptId) {
      if (closed) throw new Error("Reader unavailable."); const binding = key(workspaceId, taskId, attemptId); if (samples.has(binding)) return;
      const directory = join(root, randomUUID()); mkdirSync(directory, { mode: 0o700 }); const path = join(directory, "sample.json");
      writeFileSync(path, '{"count":8}', { flag: "wx", mode: 0o600 }); samples.set(binding, { path });
    },
    setSample(workspaceId, taskId, attemptId, text) {
      const sample = samples.get(key(workspaceId, taskId, attemptId)); if (closed || !sample) throw new Error("Reader unavailable."); writeFileSync(sample.path, text, { flag: "w" });
    },
    read(snapshot: OutcomeVerificationSnapshotV1, check: CriterionCheckV1): CriterionObservationPayloadV1 {
      if (closed) throw new Error("Reader unavailable.");
      if (check.kind === "model-assisted") return { kind: "unknown", reason: "model-only" };
      if (check.kind === "user-confirmation") return { kind: "unknown", reason: "missing-evidence" };
      if (check.kind === "tool-receipt") {
        const completed = snapshot.runtimeEvents.filter(item => item.envelope.bindingId === snapshot.execution?.bindingId && item.envelope.event.data.kind === "tool.lifecycle"
          && item.envelope.event.data.phase === "completed" && item.envelope.event.data.toolName === check.toolName);
        for (const { envelope } of completed) {
          const event = envelope.event, callId = event.correlation.normalized.toolCallId!, declaration = snapshot.runtimeEvents.find(item => item.envelope.bindingId === envelope.bindingId
            && item.envelope.event.correlation.normalized.toolCallId === callId && item.envelope.event.data.kind === "tool.lifecycle" && item.envelope.event.data.phase === "declared"
            && item.envelope.event.data.toolName === check.toolName && item.envelope.event.data.input !== undefined && canonicalJsonV1(item.envelope.event.data.input) === canonicalJsonV1(JSON.parse(check.argumentsJson)));
          if (declaration && event.data.kind === "tool.lifecycle" && event.data.phase === "completed") return { kind: "tool-receipt", toolName: check.toolName,
            argumentsJson: canonicalJsonV1(declaration.envelope.event.data.kind === "tool.lifecycle" && declaration.envelope.event.data.phase === "declared" ? declaration.envelope.event.data.input : null),
            succeeded: event.data.success, action: { kind: "action", id: callId, revision: 1 }, sourceEvent: { id: event.eventId, revision: 1 } };
        }
        return { kind: "unknown", reason: "missing-evidence" };
      }
      if (check.kind !== "artifact" && check.kind !== "deterministic-test") return { kind: "unknown", reason: "validator-unavailable" };
      const sample = samples.get(key(snapshot.task.workspaceId, snapshot.task.id, snapshot.plan.taskAttempt.attemptId));
      if (!sample || check.resourceId !== (check.kind === "artifact" ? "sample" : "sample-test")) return { kind: "unknown", reason: "validator-unavailable" };
      if (process.platform !== "linux" || !constants.O_NOFOLLOW) return { kind: "unknown", reason: "validator-unavailable" };
      if (check.kind === "artifact") {
        const fd = openSync(sample.path, constants.O_RDONLY | constants.O_NOFOLLOW); try {
          const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65_536) throw new Error("Invalid owned artifact.");
          return { kind: "artifact", resourceId: check.resourceId, artifact: { kind: "artifact", id: randomUUID(), version: 1 }, text: new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(fd)) };
        } finally { closeSync(fd); }
      }
      const run = spawnSync(process.execPath, ["-e", 'const fs=require("node:fs");const fd=fs.openSync(process.argv[1],fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size>65536)process.exit(2);const v=JSON.parse(fs.readFileSync(fd,"utf8"));process.exit(v.count===8?0:1)}catch{process.exit(2)}finally{fs.closeSync(fd)}', sample.path],
        { cwd: root, env: {}, timeout: 1000, maxBuffer: 1024, stdio: "ignore" });
      if (run.error || run.signal || run.status === null) throw new Error("Validator unavailable.");
      return { kind: "deterministic-test", resourceId: check.resourceId, exitCode: run.status };
    },
    close() { if (!closed) { rmSync(root, { recursive: true, force: true }); closed = true; } },
  };
}
