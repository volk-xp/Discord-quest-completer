import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createGlobalState } from '@vueuse/core';
import { computed, nextTick, shallowRef, watchEffect } from 'vue';

const source = fs.readFileSync(new URL('../src/composables/app-state.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

function fixture() {
    const context = vm.createContext({ createGlobalState, computed, shallowRef });
    vm.runInContext(code, context);
    return vm.runInContext('useGlobalState()', context);
}

test('appending and clearing logs notify Vue consumers', async t => {
    const state = fixture();
    let displayed = '';
    const stop = watchEffect(() => {
        displayed = state.logs.value.map(log => `${log.type}: ${log.message}`).join('\n');
    });
    t.after(stop);
    state.addLog('First message');
    await nextTick();
    assert.equal(displayed, 'info: First message');
    state.addLog('error', 'Second message');
    await nextTick();
    assert.equal(displayed, 'info: First message\nerror: Second message');
    assert.ok(Number.isFinite(state.logs.value[0].timestamp.getTime()));
    state.clearLogs();
    await nextTick();
    assert.equal(displayed, '');
});

test('logs retain only the newest 500 entries in chronological order', () => {
    const state = fixture();
    for (let index = 0; index < 510; index++) state.addLog('debug', `Message ${index}`);
    assert.equal(state.logs.value.length, 500);
    assert.equal(state.logs.value[0].message, 'Message 10');
    assert.equal(state.logs.value.at(-1).message, 'Message 509');
    state.clearLogs();
    state.addLog('After clearing');
    assert.equal(state.logs.value.length, 1);
    assert.equal(state.logs.value[0].message, 'After clearing');
});
