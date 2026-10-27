import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/utils/invoke-request.ts', import.meta.url), 'utf8');
const script = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;

export function loadRequests(invoke, timers = { setTimeout, clearTimeout }) {
    const exports = {};
    vm.runInNewContext(script, { exports, require: () => ({ invoke }), ...timers });
    return exports;
}
