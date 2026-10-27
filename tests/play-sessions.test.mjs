import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './play-sessions-loader.mjs';

for (const effect of ['addHistoryEntry', 'pushToast']) {
    test(`${effect} failure cannot prevent session registration or ticker cleanup`, async () => {
        const f = fixture({ [effect]: () => { throw new Error('optional effect failed'); } });
        await assert.rejects(f.start(), /optional effect failed/);
        assert.equal(f.api.playSessions.value.length, 1);
        assert.equal(f.timers.size, 1);
        const session = f.api.playSessions.value[0];
        assert.equal(f.native.get(session.launchId).ends_at, f.api.AUTO_STOP_MS);
        f.native.delete(session.launchId);
        await f.tick(f.api.AUTO_STOP_MS);
        assert.equal(f.api.playSessions.value.length, 0);
        assert.equal(f.timers.size, 0);
    });
}

test('actual Home cleanup leaves shared ownership and its ticker alive for a remounted consumer', async () => {
    const f = fixture();
    const session = await f.start();
    f.unmount();
    assert.equal(f.timers.size, 1);
    assert.equal(f.api.playSessions.value[0].launchId, session.launchId);
    assert.equal(f.calls.some(call => call.command === 'stop_process'), false);
    assert.deepEqual(f.removedListeners.sort(), ['dqc:focus-search', 'dqc:select-game']);
    const remounted = f.consumer();
    assert.equal(await remounted.stopPlaySession(f.game, f.executable), true);
    assert.equal(f.native.size, 0);
    assert.equal(remounted.hasPlaySession.value, false);
    assert.equal(f.timers.size, 0);
});

test('native deadline completion is reconciled after the launching view unmounts', async () => {
    const f = fixture();
    const session = await f.start();
    f.unmount();
    f.native.delete(session.launchId);
    await f.tick(f.api.AUTO_STOP_MS);
    assert.equal(f.api.playSessions.value.length, 0);
    assert.equal(f.game.is_running, false);
    assert.equal(f.executable.is_running, false);
    assert.equal(f.timers.size, 0);
});

test('the display reaching zero neither drops ownership nor repeatedly requests stopping a live native child', async () => {
    const f = fixture();
    const session = await f.start();
    await f.tick(f.api.AUTO_STOP_MS);
    await f.tick();
    assert.equal(f.api.remainingMs(session), 0);
    assert.equal(f.api.hasPlaySession.value, true);
    assert.equal(f.calls.some(call => call.command === 'stop_process'), false);
    assert.equal(await f.api.stopPlaySession(f.game, f.executable), true);
});

test('repeat launch and multiple consumers retain one native deadline and one shared ticker', async () => {
    const f = fixture();
    const first = await f.start();
    f.setClock(60_000);
    const second = await f.consumer().startPlaySession({ game: { ...f.game, uid: 'new-view-id' }, executable: f.executable });
    await f.sync();
    assert.equal(second.launchId, first.launchId);
    assert.equal(second.endsAt, first.endsAt);
    assert.equal(f.api.playSessions.value.length, 1);
    assert.equal(f.timers.size, 1);
    assert.equal(f.history.filter(([, action]) => action === 'launched').length, 1);
    assert.equal(f.api.getPlaySession(f.game.id, 'BIN\\GAME.EXE').launchId, first.launchId);
});

test('a re-created renderer uses the retained native deadline when it reclaims a live launch', async () => {
    const f = fixture();
    const session = await f.start();
    const reloaded = fixture();
    reloaded.setClock(10 * 60 * 1000);
    reloaded.native.set(session.launchId, { launch_id: session.launchId, started_at: 0, ends_at: f.api.AUTO_STOP_MS });
    reloaded.context.invoke = async (command, payload) => command === 'run_background_process'
        ? session.launchId : reloaded.invoke(command, payload);
    const reclaimed = await reloaded.start();
    await reloaded.tick();
    assert.equal(reclaimed.endsAt, f.api.AUTO_STOP_MS);
    assert.equal(reloaded.api.remainingMs(reclaimed), 6 * 60 * 1000);
});
