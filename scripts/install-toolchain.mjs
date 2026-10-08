import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkToolchain, toolchainRoot } from './check-toolchain.mjs';
import { toolchainEnvironment } from './toolchain-environment.mjs';

const transport = {};
for (const argument of process.argv.slice(2)) {
  if (argument === '--use-system-ca') transport.NODE_USE_SYSTEM_CA = '1';
  else if (argument.startsWith('--https-proxy=')) {
    let proxy;
    try { proxy = new URL(argument.slice('--https-proxy='.length)); }
    catch { throw new Error('Invalid transport proxy URL'); }
    if (!['http:', 'https:'].includes(proxy.protocol) || proxy.username || proxy.password) {
      throw new Error('Only credential-free http/https transport proxies are supported');
    }
    transport.HTTPS_PROXY = proxy.href;
  } else throw new Error('Unsupported installer argument');
}
const versions = JSON.parse(await readFile(join(toolchainRoot, 'toolchain.json'), 'utf8'));
await checkToolchain(toolchainRoot, { installed: false });
const temporaryRoot = await mkdtemp(join(tmpdir(), 'zhiwei-toolchain-install-'));
try {
  for (const name of ['home', 'tmp', 'npm-cache']) await mkdir(join(temporaryRoot, name));
  for (const name of ['npmrc', 'global-npmrc']) await writeFile(join(temporaryRoot, name), '');
  const env = { ...toolchainEnvironment(process.env, temporaryRoot), ...transport };
  const run = args => {
    const result = spawnSync('npm', args, {
      cwd: toolchainRoot, env, encoding: 'utf8', timeout: 240_000, maxBuffer: 2_000_000,
    });
    if (result.error) throw result.error;
    // Do not print raw npm output: network errors could contain a URL with credentials.
    const code = /^npm error code ([A-Z_0-9]+)$/m.exec(result.stderr)?.[1] ?? 'unreported';
    assert.equal(result.status, 0, `npm ${args[0]} failed (exit ${result.status}, code ${code}); no host configuration was inherited`);
    return result.stdout.trim();
  };
  assert.equal(run(['--version']), versions.npm, 'Install with the exact npm release bundled with Node 22.23.1');
  const before = await readFile(join(toolchainRoot, 'package-lock.json'), 'utf8');
  run(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--install-strategy=hoisted']);
  assert.equal(await readFile(join(toolchainRoot, 'package-lock.json'), 'utf8'), before, 'npm ci changed the reviewed lock');
  await checkToolchain();
  console.log('Formal toolchain installation: exact npm ci, integrity closure, unchanged lock, clean HOME/config and no lifecycle scripts OK');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
