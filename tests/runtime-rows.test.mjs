import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { fixture, flush } from './play-sessions-loader.mjs';

const home = fs.readFileSync(new URL('../src/pages/HomeView.vue', import.meta.url), 'utf8');
const addStart = home.includes('function createRuntimeGame(')
    ? home.indexOf('function createRuntimeGame(') : home.indexOf('function addGameToList(');
const rows = home.slice(addStart, home.indexOf('const forceRerenderKey'));
const favorite = home.slice(home.indexOf('function handleSelectFavoriteGame('), home.indexOf('onMounted(() =>'));

function runtimeFixture() {
    const f = fixture();
    f.gameList.value = [];
    let uid = 0;
    Object.assign(f.context, {
        gameList: f.gameList, randomString: () => `row-${++uid}`,
        getPlaySession: f.api.getPlaySession, closeSearchResults() {},
        selectGame() {}, autoPlayFavorite() {},
    });
    vm.runInContext(ts.transpileModule(rows + favorite, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, f.context);
    return f;
}

test('selected runtime rows own their executable objects and cannot change the catalog', () => {
    const f = runtimeFixture();
    f.context.addGameToList(f.game);
    const row = f.gameList.value[0];
    assert.notEqual(row.executables, f.game.executables);
    assert.notEqual(row.executables[0], f.executable);
    row.is_installed = true;
    row.executables[0].is_installed = true;
    row.executables[0].is_running = true;
    assert.equal(f.executable.is_installed, undefined);
    assert.equal(f.executable.is_running, undefined);
    f.gameList.value = [];
    f.context.addGameToList(f.game);
    assert.equal(f.gameList.value[0].executables[0].is_running, false);
    assert.equal(f.gameList.value[0].executables[0].is_installed, false);
});

test('re-added runtime rows derive running flags from retained sessions', async () => {
    const f = runtimeFixture();
    f.context.addGameToList(f.game);
    const row = f.gameList.value[0];
    const session = await f.api.startPlaySession({ game: row, executable: row.executables[0] });
    await flush();
    f.gameList.value = [];
    f.context.addGameToList(f.game);
    const readded = f.gameList.value[0];
    assert.equal(readded.is_running, true);
    assert.equal(readded.executables[0].is_running, true);
    assert.notEqual(readded.uid, row.uid);
    f.native.delete(session.launchId);
    await f.sync();
    assert.equal(readded.is_running, false);
    assert.equal(readded.executables[0].is_running, false);
    assert.equal(f.executable.is_running, undefined);
});

test('favorite selection creates a fresh runtime row and ignores saved runtime flags', () => {
    const f = runtimeFixture();
    const saved = { ...f.game, uid: 'saved', is_running: true, is_installed: true,
        executables: [{ ...f.executable, is_running: true, is_installed: true }] };
    f.context.handleSelectFavoriteGame({ detail: saved });
    const row = f.gameList.value[0];
    assert.notEqual(row.uid, saved.uid);
    assert.notEqual(row.executables[0], saved.executables[0]);
    assert.equal(row.is_running, false);
    assert.equal(row.is_installed, false);
    assert.equal(row.executables[0].is_running, false);
    assert.equal(row.executables[0].is_installed, false);
    f.context.handleSelectFavoriteGame({ detail: saved });
    assert.equal(f.gameList.value.length, 1);
});
