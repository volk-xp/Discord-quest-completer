import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { computed, effectScope, nextTick, ref, watch } from 'vue';
import { catalog } from './catalog-loader.mjs';

const source = fs.readFileSync(new URL('../src/composables/use-favorites.ts', import.meta.url), 'utf8');
const key = 'dqc:favorite-games';
const game = {
    id: '123', uid: 'local-123', name: 'Favorite',
    is_running: true, is_installed: true,
    executables: [{ name: 'game.exe', os: 'win32', is_launcher: false,
        is_running: true, is_installed: true, path: 'stale', filename: 'stale.exe' }],
};

function fixture(storage = new Map(), unavailable = false, recoveryUnavailable = false) {
    let writes = 0;
    const scope = effectScope();
    const context = vm.createContext({
        computed, ref, watch, parseGameCatalog: catalog.parseGameCatalog,
        localStorage: {
            getItem: name => {
                if (unavailable) throw new Error('Storage disabled');
                return storage.get(name) ?? null;
            },
            setItem: (name, value) => {
                if (unavailable) throw new Error('Storage disabled');
                if (recoveryUnavailable && name === `${key}:recovery`) throw new Error('Storage full');
                writes++;
                storage.set(name, value);
            },
        },
    });
    const script = source.replace(/^import .*$/gm, '').replace(/^export /gm, '');
    scope.run(() => vm.runInContext(ts.transpileModule(script, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, context));
    return { api: context.useFavorites(), storage, writes: () => writes, dispose: () => scope.stop() };
}

function assertClean(game) {
    assert.equal(game.is_running, undefined);
    assert.equal(game.is_installed, undefined);
    assert.equal(game.executables[0].is_running, undefined);
    assert.equal(game.executables[0].is_installed, undefined);
    assert.equal(game.executables[0].path, undefined);
}

test('legacy favorites migrate into identifiers and catalog metadata without runtime state', t => {
    const { api, storage, dispose } = fixture(new Map([[key, JSON.stringify([game])]]));
    t.after(dispose);
    assert.equal(api.isFavorite(game.id), true);
    assertClean(api.favoriteGames.value[0]);
    const saved = JSON.parse(storage.get(key));
    assert.equal(saved.version, 2);
    assert.deepEqual(saved.favorites, [{ id: game.id }]);
    assert.equal(saved.catalog[0].uid, undefined);
    assertClean(saved.catalog[0]);
});

test('runtime changes never write favorites or leak into a later preference save', async t => {
    const { api, storage, writes, dispose } = fixture();
    t.after(dispose);
    api.toggleFavorite(game);
    await nextTick();
    const before = storage.get(key), writeCount = writes();
    const favorite = api.favoriteGames.value[0];
    favorite.is_running = true;
    favorite.is_installed = true;
    favorite.executables[0].is_running = true;
    favorite.executables[0].is_installed = true;
    await nextTick();
    assert.equal(storage.get(key), before);
    assert.equal(writes(), writeCount);
    api.toggleFavorite({ ...game, id: '456', uid: 'local-456' });
    await nextTick();
    const saved = JSON.parse(storage.get(key));
    saved.catalog.forEach(assertClean);
    const reloaded = fixture(storage);
    t.after(reloaded.dispose);
    assert.equal(reloaded.api.favoriteGames.value.length, 2);
    reloaded.api.favoriteGames.value.forEach(assertClean);
});

test('removing and toggling favorites persist preferences and prune unused catalog records', async t => {
    const { api, storage, dispose } = fixture();
    t.after(dispose);
    api.toggleFavorite(game);
    api.toggleFavorite({ ...game, id: '456', uid: 'second-local-id' });
    await nextTick();
    assert.equal(JSON.parse(storage.get(key)).catalog.length, 2);
    api.removeFavorite(game.id);
    await nextTick();
    assert.equal(api.isFavorite(game.id), false);
    assert.equal(api.isFavorite('456'), true);
    api.toggleFavorite({ ...game, id: '456', uid: 'second-local-id' });
    await nextTick();
    const saved = JSON.parse(storage.get(key));
    assert.deepEqual(saved.favorites, []);
    assert.deepEqual(saved.catalog, []);
});

test('invalid storage is ignored and unavailable storage keeps favorites usable in memory', async t => {
    for (const value of ['{', '{}', JSON.stringify({ version: 1,
        favorites: [{ id: '999', uid: 'missing' }], catalog: [game] })]) {
        const { api, dispose } = fixture(new Map([[key, value]]));
        t.after(dispose);
        assert.equal(api.favoriteGames.value.length, 0);
    }
    const { api, dispose } = fixture(new Map(), true);
    t.after(dispose);
    api.toggleFavorite(game);
    await nextTick();
    assert.equal(api.isFavorite(game.id), true);
    assertClean(api.favoriteGames.value[0]);
});

test('re-adding the same application with a new session UID retains its favorite association', async t => {
    const { api, storage, dispose } = fixture();
    t.after(dispose);
    api.toggleFavorite(game);
    await nextTick();
    const readded = { ...game, uid: 'new-random-session-id' };
    assert.equal(api.isFavorite(readded.id), true);
    assert.equal(api.isFavorite(readded.uid), false);
    const reloaded = fixture(storage);
    t.after(reloaded.dispose);
    assert.equal(reloaded.api.isFavorite(readded.id), true);
    reloaded.api.toggleFavorite(readded);
    await nextTick();
    assert.equal(reloaded.api.favoriteGames.value.length, 0);
});

test('version 1 preferences migrate and deduplicate random UIDs by application ID', t => {
    const saved = { version: 1, favorites: [
        { id: game.id, uid: 'old-random-id' }, { id: game.id, uid: 'another-random-id' },
    ], catalog: [game] };
    const { api, storage, dispose } = fixture(new Map([[key, JSON.stringify(saved)]]));
    t.after(dispose);
    assert.equal(api.favoriteGames.value.length, 1);
    assert.equal(api.isFavorite(game.id), true);
    assert.equal(api.favoriteGames.value[0].uid, game.id);
    assert.deepEqual(JSON.parse(storage.get(key)).favorites, [{ id: game.id }]);
});

test('catalog entries can be favorited without a session UID', t => {
    const { api, dispose } = fixture();
    t.after(dispose);
    const { uid, ...catalogGame } = game;
    api.toggleFavorite(catalogGame);
    assert.equal(api.isFavorite(game.id), true);
    api.removeFavorite(game.id);
    assert.equal(api.favoriteGames.value.length, 0);
});

test('invalid saves remain untouched until an explicit edit preserves a recovery copy', async t => {
    for (const raw of ['', '{', '{}', 'null', '[null]', JSON.stringify({ version: 2, favorites: [], catalog: {} })]) {
        const f = fixture(new Map([[key, raw]]));
        t.after(f.dispose);
        await nextTick();
        assert.equal(f.api.favoriteGames.value.length, 0);
        assert.equal(f.writes(), 0);
        assert.equal(f.storage.get(key), raw);
        f.api.toggleFavorite(game);
        await nextTick();
        assert.equal(f.storage.get(`${key}:recovery`), raw);
        assert.equal(JSON.parse(f.storage.get(key)).favorites[0].id, game.id);
        f.api.removeFavorite(game.id);
        await nextTick();
        assert.equal(f.storage.get(`${key}:recovery`), raw);
    }
});

test('a failed recovery backup cannot overwrite the original saved favorites', async t => {
    const raw = JSON.stringify([game, null]);
    const f = fixture(new Map([[key, raw]]), false, true);
    t.after(f.dispose);
    f.api.removeFavorite(game.id);
    await nextTick();
    assert.equal(f.api.favoriteGames.value.length, 0);
    assert.equal(f.storage.get(key), raw);
    assert.equal(f.writes(), 0);
});

test('mixed legacy and versioned saves recover valid entries individually without overwriting raw data', async t => {
    const second = { ...game, id: '456', name: 'Second' };
    const invalid = { ...game, id: '789', executables: [null] };
    for (const saved of [[game, null, invalid, second], ...[1, 2].map(version => ({
        version,
        favorites: [{ id: game.id }, null, {}, { id: '999' }, { id: '789' }, { id: second.id }],
        catalog: [game, null, invalid, second],
    }))]) {
        const raw = JSON.stringify(saved);
        const f = fixture(new Map([[key, raw]]));
        t.after(f.dispose);
        assert.deepEqual(Array.from(f.api.favoriteGames.value, item => item.id), ['123', '456']);
        f.api.favoriteGames.value.forEach(assertClean);
        await nextTick();
        assert.equal(f.writes(), 0);
        assert.equal(f.storage.get(key), raw);
        f.api.removeFavorite('123');
        await nextTick();
        assert.equal(f.storage.get(`${key}:recovery`), raw);
        assert.deepEqual(JSON.parse(f.storage.get(key)).favorites, [{ id: '456' }]);
    }
});
