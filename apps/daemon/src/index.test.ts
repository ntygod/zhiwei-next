import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";

import { createDaemonServer } from "./index.ts";

test("health endpoint reports the bootstrap milestone", async () => {
  const server = createDaemonServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert(address && typeof address !== "string");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "zhiwei-daemon",
      version: "0.0.0",
      milestone: "M0-bootstrap",
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});
