import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { checkToolchain, toolchainRoot } from './check-toolchain.mjs';
import { toolchainEnvironment } from './toolchain-environment.mjs';

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'zhiwei-toolchain-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
async function inputCopy(t) {
  const path = await temporary(t);
  for (const file of ['package.json', 'package-lock.json', 'toolchain.json', '.node-version', 'packages/pi-adapter/fixtures/pi-upstream-baseline.json']) {
    await mkdir(dirname(join(path, file)), { recursive: true });
    await cp(join(toolchainRoot, file), join(path, file));
  }
  await symlink(join(toolchainRoot, 'node_modules'), join(path, 'node_modules'), 'dir');
  return path;
}
async function mutateJson(root, file, mutate) {
  const path = join(root, file);
  const content = JSON.parse(await readFile(path, 'utf8'));
  mutate(content);
  await writeFile(path, JSON.stringify(content));
}

test('reviewed installed dependency graph passes and actual manifest/lock drift fails', async t => {
  assert.equal((await checkToolchain()).packages, 147);
  for (const [file, mutate, pattern] of [
    ['package.json', value => { value.devDependencies.typescript = '^5.9.3'; }, /Declared toolchain drift/],
    ['package-lock.json', value => { value.packages['node_modules/typescript'].version = '5.8.3'; }, /lock drift/],
    ['package-lock.json', value => { delete value.packages['node_modules/typescript']; }, /lock drift/],
    ['package-lock.json', value => { value.packages['node_modules/undici-types'].integrity = ''; }, /integrity required/],
    ['package-lock.json', value => { value.packages['node_modules/undici-types'].resolved = 'file:/synthetic'; }, /official registry only/],
    ['package-lock.json', value => { value.packages['node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-client'].integrity = 'sha512-AAAA'; }, /strictly equal/],
  ]) {
    const root = await inputCopy(t);
    await mutateJson(root, file, mutate);
    await assert.rejects(checkToolchain(root), pattern);
  }
});

test('an actually missing installed compiler package fails before use', async t => {
  const root = await inputCopy(t);
  await rm(join(root, 'node_modules'));
  await mkdir(join(root, 'node_modules', '@earendil-works'), { recursive: true });
  await symlink(join(toolchainRoot, 'node_modules', '@earendil-works', 'pi-coding-agent'), join(root, 'node_modules', '@earendil-works', 'pi-coding-agent'), 'dir');
  await mkdir(join(root, 'node_modules', '@types'));
  await symlink(join(toolchainRoot, 'node_modules', '@types', 'node'), join(root, 'node_modules', '@types', 'node'), 'dir');
  // All dependencies before the compiler in the lock are real installed packages;
  // the missing compiler is not modeled with a mock or a false metadata flag.
  await assert.rejects(checkToolchain(root), error => error.code === 'ENOENT' && error.path === join(root, 'node_modules/typescript/package.json'));
});

test('the actual checker rejects narrowed coverage and weakened compiler settings', async t => {
  const root = await inputCopy(t);
  await mkdir(join(root, 'scripts'));
  await cp(join(toolchainRoot, 'scripts/typecheck.mjs'), join(root, 'scripts/typecheck.mjs'));
  for (const directory of ['apps', 'packages']) await cp(join(toolchainRoot, directory), join(root, directory), { recursive: true });
  const original = JSON.parse(await readFile(join(toolchainRoot, 'tsconfig.json'), 'utf8'));
  for (const mutate of [
    config => { config.include = ['packages/**/*.ts']; },
    config => { config.exclude = ['apps/daemon/src/index.test.ts']; },
    config => { config.compilerOptions.skipLibCheck = true; },
    config => { config.compilerOptions.noImplicitAny = false; },
    config => { config.compilerOptions.paths = { '*': ['./synthetic-stub'] }; },
  ]) {
    const config = structuredClone(original);
    mutate(config);
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [join(root, 'scripts/typecheck.mjs')], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /All formal source and tests|Dependency declarations|Cannot disable strict|Unsupported compiler override/);
  }
});

test('real compiler rejects bad source types, missing Pi API and bad Pi input without diagnostic suppression', () => {
  const config = ts.readConfigFile(join(toolchainRoot, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, toolchainRoot);
  assert.equal(parsed.options.strict, true);
  assert.equal(parsed.options.skipLibCheck, false);
  const target = join(toolchainRoot, 'packages/pi-adapter/src/pi-client-types.test.ts');
  for (const [suffix, code] of [
    ['const impossible: number = "synthetic-type-error";', 2322],
    ['type Missing = PiClient.RemoteSession["missingRequiredApi"];', 2339],
    ['const badPrompt: Parameters<PiClient.RemoteSession["submit"]>[0] = 42;', 2322],
    ['const badLifecycle: PiClient.RemoteSessionLifecycle = { status: "busy", operation: "pretend-success" };', 2322],
  ]) {
    const mutationTarget = suffix.startsWith('const impossible:')
      ? join(toolchainRoot, 'apps/daemon/src/index.ts')
      : target;
    const host = ts.createCompilerHost(parsed.options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (file, language, onError, shouldCreate) => {
      const source = original(file, language, onError, shouldCreate);
      return file === mutationTarget && source
        ? ts.createSourceFile(file, `${source.text}\n${suffix}\n`, language, true)
        : source;
    };
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options, host));
    assert.ok(diagnostics.some(item => item.file?.fileName === mutationTarget && item.code === code), `The compiler accepted ${suffix}`);
    assert.ok(diagnostics.every(item => item.file?.fileName === mutationTarget), 'The negative case must not hide other errors');
  }
});

test('the real clean child cannot consume synthetic host credentials, npm config, Pi config or Node preload hooks', async t => {
  const path = await temporary(t);
  const pollutedHome = join(path, 'host');
  const cleanRoot = join(path, 'clean');
  const marker = join(path, 'preload-executed');
  await mkdir(join(pollutedHome, '.pi', 'agent'), { recursive: true });
  await mkdir(join(cleanRoot, 'home'), { recursive: true });
  await mkdir(join(cleanRoot, 'tmp'));
  await writeFile(join(pollutedHome, '.npmrc'), 'registry=https://invalid.example/\n//registry.npmjs.org/:_authToken=SYNTHETIC_ONLY\n');
  await writeFile(join(pollutedHome, '.pi', 'agent', 'auth.json'), '{"synthetic":"DO_NOT_READ"}');
  await writeFile(join(path, 'preload.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad');`);
  for (const name of ['npmrc', 'global-npmrc']) await writeFile(join(cleanRoot, name), '');
  const polluted = {
    PATH: process.env.PATH,
    HOME: pollutedHome, NODE_PATH: pollutedHome,
    NODE_OPTIONS: `--require=${join(path, 'preload.cjs')}`,
    NPM_CONFIG_USERCONFIG: join(pollutedHome, '.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(pollutedHome, '.npmrc'),
    NPM_CONFIG_REGISTRY: 'https://invalid.example/',
    OPENAI_API_KEY: 'SYNTHETIC_ONLY', ANTHROPIC_API_KEY: 'SYNTHETIC_ONLY',
    PI_CODING_AGENT_DIR: join(pollutedHome, '.pi', 'agent'),
    HTTPS_PROXY: 'http://invalid.example/',
  };
  const env = toolchainEnvironment(polluted, cleanRoot);
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PI_CODING_AGENT_DIR', 'HTTPS_PROXY']) assert.equal(env[key], undefined);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { existsSync, readFileSync } from 'node:fs';
    assert.equal(existsSync(process.env.HOME + '/.pi/agent/auth.json'), false);
    assert.equal(readFileSync(process.env.NPM_CONFIG_USERCONFIG, 'utf8'), '');
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PI_CODING_AGENT_DIR']) assert.equal(process.env[key], undefined);
    console.log('clean');
  `], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'clean');
  const npmConfig = spawnSync('npm', ['config', 'get', 'registry'], { cwd: toolchainRoot, env, encoding: 'utf8' });
  assert.equal(npmConfig.status, 0, npmConfig.stderr);
  assert.equal(npmConfig.stdout.trim(), 'https://registry.npmjs.org/');
  const npmHome = spawnSync('npm', ['config', 'get', 'userconfig'], { cwd: toolchainRoot, env, encoding: 'utf8' });
  assert.equal(npmHome.status, 0, npmHome.stderr);
  assert.equal(npmHome.stdout.trim(), join(cleanRoot, 'npmrc'));
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  const shell = spawnSync('sh', [join(toolchainRoot, 'scripts/formal-toolchain.sh'), 'check'], { env: polluted, encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr);
  assert.ok(!`${shell.stdout}${shell.stderr}`.includes('SYNTHETIC_ONLY'));
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});

test('SDK confinement preserves application composition through the adapter public entry', async t => {
  const root = await temporary(t);
  for (const directory of ['apps', 'packages/domain', 'packages/cognition-core', 'packages/memory-store', 'packages/context-compiler', 'packages/protocol', 'packages/evals']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  const app = join(root, 'apps/synthetic.ts');
  const domain = join(root, 'packages/domain/synthetic.ts');
  for (const [path, source, status] of [
    [app, 'import { normalizePiEvent } from "../packages/pi-adapter/src/index.ts";', 0],
    [app, 'const fixture = { implementation: "@earendil-works/pi-coding-agent" };', 0],
    [app, 'import type { RemoteSession } from "@earendil-works/pi-coding-agent/client";', 1],
    [domain, 'type Pi = import("@earendil-works/pi-coding-agent/client");', 1],
    [domain, 'import { normalizePiEvent } from "../pi-adapter/src/index.ts";', 1],
  ]) {
    await writeFile(app, '');
    await writeFile(domain, '');
    await writeFile(path, source);
    const result = spawnSync(process.execPath, [join(toolchainRoot, 'scripts/check-architecture.mjs')], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
  }
});
