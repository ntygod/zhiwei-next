import { fileURLToPath } from 'node:url';
import { createNodeScenarioExecutor, observeScenarioProvenance, observeToolchainVersions, runScenarioSuite } from '../packages/evals/src/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const selected = process.argv.slice(2);
  const provenance = observeScenarioProvenance(root);
  const toolchain = observeToolchainVersions(root);
  if (provenance.environment.node !== '22.23.1' || toolchain.typescript !== '5.9.3' || toolchain.nodeTypes !== '22.19.19' || toolchain.pi !== '0.84.1') {
    throw new Error('Formal toolchain required');
  }
  const report = await runScenarioSuite({ ...provenance, ...(selected.length ? { select: selected } : {}) }, createNodeScenarioExecutor());
  // Metadata is observed here, never supplied through command-line fixture flags.
  console.log(JSON.stringify({ ...report, toolchain }, null, 2));
  process.exitCode = report.totals.failed ? 1 : 0;
} catch {
  console.error('Scenario run rejected: invalid selection, source identity, or formal toolchain.');
  process.exitCode = 2;
}
