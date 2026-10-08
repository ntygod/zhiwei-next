import ts from 'typescript';
import { resolve } from 'node:path';
import { toolchainRoot } from './check-toolchain.mjs';

// Explicit diagnostic command, never included as a success condition in check.
const config = ts.readConfigFile(resolve(toolchainRoot, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, toolchainRoot);
const path = resolve(toolchainRoot, 'packages/pi-adapter/src/__root_type_diagnostic__.ts');
const source = 'import type { AgentSessionEvent, CreateAgentSessionOptions, RpcCommand } from "@earendil-works/pi-coding-agent";\nexport type RootContract = [AgentSessionEvent, CreateAgentSessionOptions, RpcCommand];\n';
const host = ts.createCompilerHost(parsed.options);
const original = host.getSourceFile.bind(host);
host.getSourceFile = (file, language, onError, shouldCreate) => file === path
  ? ts.createSourceFile(file, source, language, true)
  : original(file, language, onError, shouldCreate);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([path], parsed.options, host));
console.error(ts.formatDiagnostics(diagnostics, {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => toolchainRoot,
  getNewLine: () => '\n',
}));
console.log(`Pi root SDK declaration diagnostics: ${diagnostics.length}; no diagnostics suppressed`);
process.exitCode = diagnostics.length ? 1 : 0;
