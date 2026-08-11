import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "./index.ts";

test("version command is deterministic", async () => {
  const lines: string[] = [];
  const exitCode = await runCli(["version"], (line) => lines.push(line));

  assert.equal(exitCode, 0);
  assert.deepEqual(lines, ["zhiwei-next 0.0.0"]);
});
