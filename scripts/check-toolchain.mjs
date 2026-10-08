import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifest = await json('package.json');
const lock = await json('package-lock.json');
assert.equal(process.versions.node, '22.23.1', 'Use the exact tested Node release');
assert.equal(manifest.engines.node, '22.23.1');
assert.equal(manifest.engines.npm, '10.9.8');
assert.equal(manifest.packageManager, 'npm@10.9.8');
assert.equal((await readFile(new URL('.node-version', root), 'utf8')).trim(), manifest.engines.node);
assert.equal(lock.lockfileVersion, 3);
assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
for (const [name, version] of Object.entries(manifest.devDependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name}: exact version required`);
  assert.equal(lock.packages[`node_modules/${name}`].version, version, `${name}: lock drift`);
  assert.equal((await json(`node_modules/${name}/package.json`)).version, version, `${name}: installed drift`);
}
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  assert.equal(entry.link, undefined, `${path}: linked dependencies are unsupported`);
  assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${path}: official registry only`);
  assert.match(entry.integrity, /^sha512-/, `${path}: integrity required`);
}
const baseline = await json('packages/pi-adapter/fixtures/pi-upstream-baseline.json');
const piLock = lock.packages[`node_modules/${baseline.package.name}`];
assert.equal(piLock.version, baseline.package.version);
assert.equal(piLock.integrity, baseline.dynamicProbe.registryArtifact.integrity);
console.log('Formal toolchain: exact Node/npm/package inputs and installed direct dependencies OK');
