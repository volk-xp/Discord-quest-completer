import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { catalog } from './catalog-loader.mjs';

const source = fs.readFileSync(new URL('../src/components/GameExecutables.vue', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function splitExecutableName('), source.indexOf('</script>'));

test('catalog fields cannot replace the path derived from the executable name', () => {
    const emitted = [];
    const context = vm.createContext({
        console, path: { sep: () => '\\' }, props: { game: { id: '123', name: 'Fixture' } },
        launchExecutable: catalog.launchExecutable,
        gameActions: { isGameExecutableInstalled: () => true },
        emit: (...args) => emitted.push(args),
    });
    vm.runInContext(ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
    context.handleLaunch({ name: 'bin/game.exe', os: 'win32', is_launcher: false,
        path: '../../outside', filename: 'outside.exe', segments: 100, is_installed: true });
    assert.equal(emitted[0][1].executable.path, 'bin');
    assert.equal(emitted[0][1].executable.filename, 'game.exe');
    assert.equal(emitted[0][1].executable.segments, 2);
});

const home = fs.readFileSync(new URL('../src/pages/HomeView.vue', import.meta.url), 'utf8');
const actions = home.slice(home.indexOf('async function createDummyGame('), home.indexOf('// Auto-play:'));

function homeContext(rejectInstall = false) {
    const game = { id: '123456789012345678', uid: 'fixture', name: 'Fixture',
        executables: [{ name: 'bin/game.exe', os: 'win32', is_launcher: false }] };
    const calls = [];
    const messages = [];
    const context = vm.createContext({
        console: { log() {}, error() {} }, gamePathPayload: catalog.gamePathPayload,
        gameList: { value: [game] }, currentlyPlaying: { value: null },
        addLog: (...args) => messages.push(args), notify: (...args) => messages.push(args),
        addHistoryEntry() {},
        startPlaySession: async ({ game, executable }) => {
            await context.invoke('run_background_process', { name: game.name, ...catalog.gamePathPayload(game.id, executable) });
            game.is_running = true;
            executable.is_running = true;
        },
        invoke: async (command, payload) => {
            calls.push({ command, payload });
            if (rejectInstall && command === 'create_fake_game') throw new Error('Unsafe game path');
            if (command === 'run_background_process') return 'launch-1';
        },
    });
    vm.runInContext(ts.transpileModule(actions, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
    return { context, game, calls, messages };
}

test('install and launch send only exact ID and executable name as path inputs', async () => {
    const { context, game, calls } = homeContext();
    await context.installAndPlay({ game, executable: { ...game.executables[0],
        path: '../../outside', filename: 'outside.exe', segments: 99 } });
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
        { command: 'create_fake_game', payload: { app_id: game.id, executable_name: 'bin/game.exe' } },
        { command: 'run_background_process', payload: { name: game.name, app_id: game.id, executable_name: 'bin/game.exe' } },
    ]);
    assert.equal(game.executables[0].is_running, true);
});

test('native path rejection is reported without launching or marking installed', async () => {
    const { context, game, calls, messages } = homeContext(true);
    await context.installAndPlay({ game, executable: game.executables[0] });
    assert.equal(calls.length, 1);
    assert.equal(game.executables[0].is_installed, undefined);
    assert.equal(game.executables[0].is_running, undefined);
    assert.ok(messages.some(([kind, text]) => kind === 'error' && text.includes('Unsafe game path')));
});
