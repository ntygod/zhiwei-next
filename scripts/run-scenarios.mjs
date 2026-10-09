import { fileURLToPath } from 'node:url';
import { checkToolchain } from './check-toolchain.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  await checkToolchain(root);
  const { createNodeScenarioExecutor, observeScenarioProvenance, observeToolchainVersions, runScenarioSuite, requireUnchangedScenarioSource } = await import('../packages/evals/src/index.ts');
  const selected = process.argv.slice(2);
  // Include ignored/new executable files too: a clean status cannot bind them.
  const sourceRoots = [
    'scripts/run-scenarios.mjs', 'scripts/check-toolchain.mjs',
    'packages/evals/src', 'packages/domain/src', 'packages/protocol/src',
    'packages/memory-store/src', 'packages/memory-store/migrations',
  ];
  const provenance = observeScenarioProvenance(root, sourceRoots);
  requireUnchangedScenarioSource(provenance, observeScenarioProvenance(root, sourceRoots));
  const toolchain = observeToolchainVersions(root);
  if (toolchain.npm !== '10.9.8' || provenance.environment.node !== '22.23.1' || toolchain.typescript !== '5.9.3' || toolchain.nodeTypes !== '22.19.19' || toolchain.pi !== '0.84.1') {
    throw new Error('Formal toolchain required');
  }
  const report = await runScenarioSuite({ ...provenance, ...(selected.length ? { select: selected } : {}) }, createNodeScenarioExecutor());
  requireUnchangedScenarioSource(provenance, observeScenarioProvenance(root, sourceRoots));
  // Metadata is observed here, never supplied through command-line fixture flags.
  console.log(JSON.stringify({ ...report, toolchain }, null, 2));
  process.exitCode = report.totals.failed ? 1 : 0;
} catch {
  console.error('Scenario run rejected: invalid selection, dirty/changed source, or formal toolchain.');
  process.exitCode = 2;
}
