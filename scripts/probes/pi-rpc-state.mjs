import { PiCliContractError, runPiCliStateProbe } from "../../packages/pi-adapter/fixtures/pi-cli-state-contract.ts";

try {
  const result = await runPiCliStateProbe({
    packageDirectory: process.env.PI_PACKAGE_DIR,
    nodeExecutable: process.execPath,
    workspaceDirectory: process.env.PI_PROBE_CWD,
    stateDirectory: process.env.PI_PROBE_STATE_DIR,
    hostEnvironment: process.env,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // The installed package, environment, paths, stderr and JSON are untrusted.
  // Never print their values or a raw exception/stack in an artifact error.
  console.error(error instanceof PiCliContractError ? error.message : "Pi CLI state probe failed: configuration.");
  process.exitCode = 1;
}
