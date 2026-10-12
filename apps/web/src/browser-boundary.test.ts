import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

test("Browser production closure compiles with actual DOM libraries and no Node declarations", () => {
  const root = fileURLToPath(new URL("./workbench.ts", import.meta.url));
  const program = ts.createProgram([root], { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], types: [], strict: true, noEmit: true, allowImportingTsExtensions: true,
    verbatimModuleSyntax: true, erasableSyntaxOnly: true, skipLibCheck: false });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => "\n" }));
  for (const source of program.getSourceFiles().filter(file => !file.isDeclarationFile)) {
    assert.equal(source.fileName.includes("/node_modules/"), false);
    for (const statement of source.statements) if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier))
      assert.equal(statement.moduleSpecifier.text.startsWith("node:"), false, source.fileName);
  }
});
