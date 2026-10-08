import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const toolchainRoot = fileURLToPath(new URL('../', import.meta.url));
const digest = text => createHash('sha256').update(text).digest('hex');
const platformMatches = (values, actual) => !values ||
  (!values.includes(`!${actual}`) && (!values.some(value => !value.startsWith('!')) || values.includes(actual)));

export async function checkToolchain(root = toolchainRoot, { installed = true } = {}) {
  const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const versions = await json('toolchain.json');
  const manifest = await json('package.json');
  const lock = await json('package-lock.json');
  assert.equal(versions.schemaVersion, 1);
  assert.equal(process.versions.node, versions.node, 'Use the exact tested Node release');
  assert.equal(manifest.engines.node, versions.node);
  assert.equal(manifest.engines.npm, versions.npm);
  assert.equal(manifest.packageManager, `npm@${versions.npm}`);
  assert.equal((await readFile(resolve(root, '.node-version'), 'utf8')).trim(), versions.node);
  assert.deepEqual(manifest.devDependencies, versions.devDependencies, 'Declared toolchain drift');
  assert.equal(manifest.dependencies, undefined, 'G-3a has no production dependency selection');
  assert.equal(manifest.optionalDependencies, undefined);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.name, manifest.name);
  assert.equal(lock.version, manifest.version);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
  for (const [name, version] of Object.entries(versions.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name}: exact version required`);
    assert.equal(lock.packages[`node_modules/${name}`]?.version, version, `${name}: lock drift`);
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert.match(path, /^node_modules\/(?!.*(?:^|\/)\.\.(?:\/|$))/);
    assert.equal(entry.link, undefined, `${path}: linked dependencies unsupported`);
    assert.match(entry.version, /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, `${path}: exact version required`);
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${path}: official registry only`);
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/, `${path}: integrity required`);
    if (!installed) continue;
    const applicable = platformMatches(entry.os, process.platform) && platformMatches(entry.cpu, process.arch);
    if (entry.optional && !applicable) continue;
    const actual = await json(`${path}/package.json`);
    assert.equal(actual.version, entry.version, `${path}: installed dependency drift`);
  }
  const baseline = await json('packages/pi-adapter/fixtures/pi-upstream-baseline.json');
  const prefix = `node_modules/${baseline.package.name}`;
  assert.equal(lock.packages[prefix].version, baseline.package.version);
  assert.equal(lock.packages[prefix].integrity, baseline.dynamicProbe.registryArtifact.integrity);
  assert.equal(lock.packages[prefix].hasShrinkwrap, true);
  if (installed) {
    const bytes = await readFile(resolve(root, `${prefix}/npm-shrinkwrap.json`));
    assert.equal(digest(bytes), versions.piShrinkwrapSha256, 'Published Pi shrinkwrap drift');
    const upstream = JSON.parse(bytes);
    const expectedPaths = Object.keys(upstream.packages).filter(Boolean).map(path => `${prefix}/${path}`).sort();
    const actualPaths = Object.keys(lock.packages).filter(path => path.startsWith(`${prefix}/`)).sort();
    assert.deepEqual(actualPaths, expectedPaths, 'The complete published Pi graph must be retained');
    const supplements = new Map(versions.publishedIntegritySupplements.map(item => [item.path, item]));
    for (const [path, original] of Object.entries(upstream.packages)) {
      if (!path) continue;
      const key = `${prefix}/${path}`;
      const { dev, ...entry } = lock.packages[key];
      assert.equal(dev, true);
      if (!original.integrity) {
        const supplement = supplements.get(key);
        assert.ok(supplement, `${key}: missing reviewed registry integrity supplement`);
        assert.equal(entry.integrity, supplement.integrity);
        delete entry.integrity;
        supplements.delete(key);
      }
      assert.deepEqual(entry, original, `${key}: published closure drift`);
    }
    assert.equal(supplements.size, 0, 'Unexpected integrity supplement');
  }
  return { packages: Object.keys(lock.packages).length - 1, node: versions.node, npm: versions.npm };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await checkToolchain(toolchainRoot, { installed: !process.argv.includes('--inputs-only') });
  console.log(`Formal toolchain: ${result.packages} exact integrity-pinned packages; Node ${result.node}/npm ${result.npm}; published Pi closure retained`);
}
