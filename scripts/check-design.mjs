import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = relative => readFile(path.join(root, relative), 'utf8');
const contract = JSON.parse(await read('docs/architecture-contract.json'));
const sources = JSON.parse(await read('docs/reference-lock.json'));
assert.equal(contract.schemaVersion, 1);
assert.equal(contract.status, 'design-only');
assert.equal(contract.language, 'TypeScript');
assert.equal(contract.defaultDeployment, 'cloud');
assert.equal(contract.runtime, sources.selectedRuntime.name);
assert.equal(contract.runtime, 'deepseek-harness-native');
assert.equal(contract.composition, 'profile-bundle');
assert.equal(sources.selectedRuntime.integration, 'native-plugin-api-profile-bundle');
assert.equal(contract.memoryContent, 'markdown');
assert.equal(contract.controlStore, 'postgresql-17');
assert.equal(contract.uiDesign, 'excluded');
assert.equal(contract.productPhases, 'none');
assert.equal(sources.selectedRuntime.runtimeVerification, 'not-run');
assert.match(sources.selectedRuntime.sourceCommit, /^[0-9a-f]{40}$/);
assert.match(sources.selectedRuntime.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
assert.match(sources.selectedFramework.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
const development = await read('docs/architecture/harness-development.md');
const bundleExample = JSON.parse(development.match(/```json\n([\s\S]*?)\n```/)[1]);
assert.equal(bundleExample.engines.dsh, sources.selectedRuntime.version);
assert.equal(bundleExample.peerDependencies['@deepseek-ai/cordis'], sources.selectedFramework.version);
assert.equal(bundleExample.devDependencies['@deepseek-ai/cordis'], sources.selectedFramework.version);
assert.equal(bundleExample.peerDependencies['@deepseek-ai/dsh-agent'], sources.selectedRuntime.version);
assert.match(sources.resetBase, /^[0-9a-f]{40}$/);

const unique = (values, label) => {
  assert.equal(new Set(values).size, values.length, `${label}: duplicate identity`);
};
unique(contract.chapters, 'chapters');
unique(contract.requirements.map(value => value.id), 'requirements');
const acceptance = await read('docs/architecture/acceptance.md');
const scenarioIds = [...acceptance.matchAll(/^\| ((?:E|R|X|M|L|A|S|D)\d{2}) \|/gm)].map(match => match[1]);
unique(scenarioIds, 'scenarios');
const scenarios = new Set(scenarioIds);
const referenced = new Set();
assert.match(acceptance, /全部场景为 \*\*not-run\*\*/);
for (const requirement of contract.requirements) {
  assert.match(requirement.id, /^REQ\d{2}$/);
  assert.ok(requirement.title && requirement.chapters.length && requirement.scenarios.length, `${requirement.id}: incomplete`);
  for (const chapter of requirement.chapters) assert.ok(contract.chapters.includes(chapter), `${requirement.id}: unknown chapter ${chapter}`);
  for (const scenario of requirement.scenarios) {
    assert.ok(scenarios.has(scenario), `${requirement.id}: unknown scenario ${scenario}`);
    referenced.add(scenario);
  }
}
for (const scenario of scenarios) assert.ok(referenced.has(scenario), `Unmapped scenario: ${scenario}`);
for (const chapter of contract.chapters) {
  const content = await read(`docs/architecture/${chapter}.md`);
  assert.match(content, /^# /, `${chapter}: missing document title`);
  assert.ok(content.trim().length > 300, `${chapter}: empty design`);
}

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(target));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
  return files;
}
let links = 0;
const markdownFiles = await collect(root);
for (const filename of markdownFiles) {
  const content = await readFile(filename, 'utf8');
  assert.equal((content.match(/^```/gm) ?? []).length % 2, 0, `Unclosed code fence: ${filename}`);
  for (const match of content.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    assert.ok(!href.includes('\\'), `Use portable links: ${filename}: ${href}`);
    const relative = decodeURIComponent(href.split('#')[0]);
    const target = path.resolve(path.dirname(filename), relative);
    assert.ok(target.startsWith(root), `Link escapes repository: ${filename}: ${href}`);
    assert.ok((await stat(target)).isFile(), `Missing link target: ${filename}: ${href}`);
    links += 1;
  }
}
const reset = await read('docs/repository-reset.md');
assert.ok(reset.includes(sources.resetBase), 'Reset base differs from source record');
assert.match(reset, /旧工具链|工具链断言/);
assert.match(reset, /不冒充原服务端要求的/);
const workflow = await read('.github/workflows/architecture.yml');
assert.match(workflow, /name: Architecture validation/);
assert.ok(!/^\s+name:\s*check\s*$/m.test(workflow), 'Design CI must not counterfeit the legacy required context');
assert.ok(!/pull_request_target/.test(workflow), 'Untrusted PR checks must not use a privileged event');
console.log(`Architecture documents: ${markdownFiles.length}; local links: ${links}; requirements: ${contract.requirements.length}; scenarios: ${scenarios.size}`);
console.log('PASS: design consistency only. Product/runtime/security/recovery scenarios remain not-run.');
