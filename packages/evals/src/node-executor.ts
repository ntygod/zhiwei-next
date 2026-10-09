import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { ScenarioExecutionError, type ScenarioExecutor } from "./scenario-runner.ts";

export function createNodeScenarioExecutor(options: {
  readonly workerUrl?: URL;
  readonly tempRoot?: string;
} = {}): ScenarioExecutor {
  return {
    async execute(id, fixture, timeoutMs): Promise<unknown> {
      const directory = await mkdtemp(join(options.tempRoot ?? tmpdir(), "zhiwei-g4-"));
      let worker: Worker | undefined;
      try {
        worker = new Worker(options.workerUrl ?? new URL("./worker.ts", import.meta.url), {
          workerData: { id, fixture, filePath: join(directory, "synthetic.sqlite") },
          execArgv: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"],
          env: {},
          stdout: true,
          stderr: true,
        });
        const activeWorker = worker;
        return await new Promise<unknown>((resolve, reject) => {
          let count = 0;
          let evidence: unknown;
          let failure: ScenarioExecutionError | undefined;
          const timer = setTimeout(() => {
            failure = new ScenarioExecutionError("timeout");
            // Termination stops synchronous loops and pending I/O too. Exit,
            // rather than the timeout callback, settles this operation.
            void activeWorker.terminate();
          }, timeoutMs);
          activeWorker.stdout?.resume();
          activeWorker.stderr?.resume();
          activeWorker.on("message", (message: unknown) => { count += 1; evidence = message; });
          activeWorker.on("error", () => { failure ??= new ScenarioExecutionError("execution"); });
          activeWorker.on("exit", code => {
            clearTimeout(timer);
            if (failure) reject(failure);
            else if (code !== 0) reject(new ScenarioExecutionError("execution"));
            else if (count !== 1) reject(new ScenarioExecutionError("invalid-output"));
            else resolve(evidence);
          });
        });
      } finally {
        // await termination even on setup/transport failure, then remove only
        // this host-owned synthetic directory. No late DB writes after return.
        if (worker) await worker.terminate();
        try { await rm(directory, { recursive: true, force: true }); }
        catch { throw new ScenarioExecutionError("cleanup"); }
      }
    },
  };
}
