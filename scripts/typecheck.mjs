import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

// Use the real compiler program, including test files and imported declarations.
// No transpileModule, emit-only runner, generated stub, or diagnostic filtering.
const root = resolve(new URL('..', import.meta.url).pathname);
const configPath = resolve(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
for (const flag of ['strict', 'noEmit', 'allowImportingTsExtensions', 'verbatimModuleSyntax', 'erasableSyntaxOnly']) {
  assert.equal(parsed.options[flag], true, `Required compiler option: ${flag}`);
}
assert.equal(parsed.options.skipLibCheck, false, 'Dependency declarations must be checked');
assert.equal(parsed.options.noCheck, undefined, 'Compiler diagnostics cannot be disabled');
async function sources(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sources(path));
    else if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name)) result.push(path);
  }
  return result;
}
const expected = [...await sources(resolve(root, 'apps')), ...await sources(resolve(root, 'packages'))].sort();
assert.deepEqual([...parsed.fileNames].sort(), expected, 'All formal source and tests must be compiler roots');
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else {
  console.log(`TypeScript ${ts.version}: strict noEmit OK (${expected.length} formal source/test roots; dependency declarations checked)`);
}
