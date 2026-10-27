import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { effectScope, nextTick, ref, watch } from 'vue';

const source = fs.readFileSync(new URL('../src/composables/use-history.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const entry = { id: 'saved', gameName: 'Game', action: 'launched', timestamp: 1000 };

function fixture(raw, failStorage = false) {
    const scope = effectScope();
    const context = vm.createContext({ ref, watch, localStorage: {
        getItem() { if (failStorage) throw new Error('storage unavailable'); return raw; },
        setItem() { if (failStorage) throw new Error('storage unavailable'); },
    } });
    scope.run(() => vm.runInContext(code, context));
    return { api: context.useHistory(), close: () => scope.stop() };
}

test('invalid stored history recovers to a usable array', async () => {
    for (const raw of [null, '{', '{}', 'null', '42', 'true', '"text"']) {
        const f = fixture(raw);
        try {
            assert.equal(f.api.history.value.length, 0, String(raw));
            f.api.addHistoryEntry('Game', 'launched');
            assert.equal(f.api.history.value.length, 1);
            await nextTick();
        } finally { f.close(); }
    }
});

test('stored history filters malformed entries and caps valid entries at fifty', async () => {
    const invalid = [null, {}, [], { ...entry, id: 1 }, { ...entry, gameName: null },
        { ...entry, action: 'unknown' }, { ...entry, timestamp: '1000' },
        { ...entry, timestamp: null }, { ...entry, timestamp: -1 }];
    const saved = Array.from({ length: 60 }, (_, index) => ({ ...entry, id: `saved-${index}` }));
    const f = fixture(JSON.stringify([...invalid, ...saved]));
    try {
        assert.deepEqual(JSON.parse(JSON.stringify(f.api.history.value)), saved.slice(0, 50));
        f.api.addHistoryEntry('New game', 'stopped');
        assert.equal(f.api.history.value.length, 50);
        assert.equal(f.api.history.value[0].gameName, 'New game');
        assert.equal(f.api.history.value[49].id, 'saved-48');
        await nextTick();
    } finally { f.close(); }
});

test('unavailable storage does not prevent recording history', async () => {
    const f = fixture(null, true);
    try {
        f.api.addHistoryEntry('Game', 'launched');
        await nextTick();
        assert.equal(f.api.history.value.length, 1);
    } finally { f.close(); }
});
