import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, flush } from './play-sessions-loader.mjs';

test('a manually closed helper clears shared running state and its countdown', async () => {
    const f = fixture();
    const session = await f.start();
    f.native.delete(session.launchId);
    await f.sync();
    assert.equal(f.executable.is_running, false);
    assert.equal(f.game.is_running, false);
    assert.equal(f.api.currentlyPlaying.value, null);
    assert.equal(f.api.playSessions.value.length, 0);
});

test('exit monitoring preserves other running helpers and unrelated RPC state', async () => {
    const f = fixture();
    const first = await f.start();
    const other = { name: 'other.exe', os: 'win32' };
    f.game.executables.push(other);
    await f.api.startPlaySession({ game: f.game, executable: other });
    await flush();
    const rpcGame = { id: '456', is_running: true, executables: [] };
    f.gameList.value.push(rpcGame);
    f.native.delete(first.launchId);
    await f.sync();
    assert.equal(f.executable.is_running, false);
    assert.equal(f.game.is_running, true);
    assert.equal(other.is_running, true);
    assert.equal(rpcGame.is_running, true);
});

test('stop identifies the retained launch, never an executable name or PID', async () => {
    const f = fixture();
    const session = await f.start();
    assert.equal(await f.api.stopPlaySession(f.game, f.executable), true);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.filter(call => call.command === 'stop_process'))),
        [{ command: 'stop_process', payload: { launch_id: session.launchId } }]);
});

test('failed stop and failed polling retain ownership for retry', async () => {
    const f = fixture();
    await f.start();
    f.context.invoke = async () => { throw new Error('IPC unavailable'); };
    assert.equal(await f.api.stopPlaySession(f.game, f.executable), false);
    await f.sync();
    assert.equal(f.api.hasPlaySession.value, true);
    assert.equal(f.executable.is_running, true);
    f.context.invoke = f.invoke;
    assert.equal(await f.consumer().stopPlaySession(f.game, f.executable), true);
});

test('stale launch IDs and late stop responses cannot clear a replacement', async () => {
    const f = fixture();
    const old = await f.start();
    let finish;
    f.context.invoke = async (command, payload) => command === 'stop_process'
        ? new Promise(resolve => { finish = resolve; }) : f.invoke(command, payload);
    const pending = f.api.stopPlaySession(f.game, f.executable);
    f.native.delete(old.launchId);
    const replacement = await f.start();
    finish();
    assert.equal(await pending, false);
    assert.equal(await f.api.stopPlaySession(f.game, f.executable, old.launchId), false);
    assert.equal(f.api.playSessions.value[0].launchId, replacement.launchId);
    assert.equal(f.game.is_running, true);
});

test('a late poll cannot clear a new launch and polling does not race an in-flight stop', async () => {
    const f = fixture();
    const old = await f.start();
    let finishPoll;
    f.context.invoke = async (command, payload) => command === 'running_processes'
        ? new Promise(resolve => { finishPoll = resolve; }) : f.invoke(command, payload);
    const polling = f.sync();
    f.native.delete(old.launchId);
    const replacement = await f.start();
    finishPoll([]);
    await polling;
    assert.equal(f.api.playSessions.value[0].launchId, replacement.launchId);
    let finishStop;
    f.context.invoke = async command => command === 'running_processes' ? []
        : new Promise(resolve => { finishStop = resolve; });
    const stopping = f.api.stopPlaySession(f.game, f.executable);
    await f.sync();
    assert.equal(f.game.is_running, true);
    finishStop();
    assert.equal(await stopping, true);
    assert.equal(f.api.hasPlaySession.value, false);
});

test('unowned executables cannot be stopped and removed game rows do not lose retained launch IDs', async () => {
    const f = fixture();
    assert.equal(await f.api.stopPlaySession(f.game, f.executable), false);
    const session = await f.start();
    f.gameList.value = [];
    f.unmount();
    assert.equal(await f.consumer().stopPlaySession(f.game, f.executable), true);
    assert.equal(f.native.has(session.launchId), false);
    assert.equal(f.api.hasPlaySession.value, false);
});

test('launch payloads retain only the validated application ID and executable name as path inputs', async () => {
    const f = fixture();
    await f.api.startPlaySession({ game: f.game,
        executable: { ...f.executable, path: '../../outside', filename: 'outside.exe' } });
    const launch = f.calls.find(call => call.command === 'run_background_process');
    assert.deepEqual(JSON.parse(JSON.stringify(launch.payload)),
        { name: f.game.name, app_id: f.game.id, executable_name: 'bin/game.exe' });
});
