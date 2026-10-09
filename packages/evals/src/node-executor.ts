import { fork, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ScenarioExecutionError, type ScenarioExecutor } from "./scenario-runner.ts";

// A bounded, trusted evaluation process, not a security sandbox for arbitrary code.
// No shell, provider, credential inheritance, persistent data, or production Worker.
export function createNodeScenarioExecutor(options: {
  readonly workerUrl?: URL;
  readonly tempRoot?: string;
} = {}): ScenarioExecutor {
  return {
    async execute(id, fixture, timeoutMs): Promise<unknown> {
      let directory: string;
      try { directory = await mkdtemp(join(options.tempRoot ?? tmpdir(), "zhiwei-g4-")); }
      catch { throw new ScenarioExecutionError("execution"); }
      let child: ChildProcess | undefined;
      let closed: Promise<void> | undefined;
      try {
        child = fork(options.workerUrl ?? new URL("./worker.ts", import.meta.url), [JSON.stringify({
          id, fixture, filePath: join(directory, "synthetic.sqlite"),
        })], {
          cwd: directory,
          execPath: process.execPath,
          execArgv: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"],
          env: {},
          stdio: ["ignore", "pipe", "pipe", "ipc"],
          serialization: "json",
        });
        const activeChild = child;
        closed = new Promise(resolve => activeChild.once("close", () => resolve()));
        return await new Promise<unknown>((resolve, reject) => {
          let count = 0;
          let evidence: unknown;
          let failure: ScenarioExecutionError | undefined;
          let stopping = false;
          const fail = (code: ScenarioExecutionError["code"]): void => {
            failure ??= new ScenarioExecutionError(code);
            // SIGKILL also interrupts native blocking I/O; no Promise.race that
            // returns while the process can still write a database or artifact.
            if (!stopping) { stopping = true; activeChild.kill("SIGKILL"); }
          };
          const timer = setTimeout(() => fail("timeout"), timeoutMs);
          activeChild.stdout?.on("data", () => fail("invalid-output"));
          activeChild.stderr?.on("data", () => fail("invalid-output"));
          activeChild.on("message", (message: unknown) => {
            count += 1;
            if (count > 1) fail("invalid-output");
            else evidence = message;
          });
          activeChild.on("error", () => fail("execution"));
          activeChild.on("close", code => {
            clearTimeout(timer);
            if (failure) reject(failure);
            else if (code !== 0) reject(new ScenarioExecutionError("execution"));
            else if (count !== 1) reject(new ScenarioExecutionError("invalid-output"));
            else resolve(evidence);
          });
        });
      } catch (error) {
        throw error instanceof ScenarioExecutionError ? error : new ScenarioExecutionError("execution");
      } finally {
        if (child && closed) {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
          await closed;
        }
        try { await rm(directory, { recursive: true, force: true }); }
        catch { throw new ScenarioExecutionError("cleanup"); }
      }
    },
  };
}
