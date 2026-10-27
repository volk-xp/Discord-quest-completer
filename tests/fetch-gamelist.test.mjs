import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { loadRequests } from './requests-loader.mjs';
import { catalog } from './catalog-loader.mjs';

const source = fs.readFileSync(new URL('../src/composables/fetch-gamelist.ts', import.meta.url), 'utf8');
const CACHE_KEY = 'dqc:game-catalog';
const game = name => ({ id: '123', name, executables: [{ name: 'game.exe', os: 'win32' }] });
function fixture(mirror, discord = [game('Discord')], bundled = [game('Bundled')], storage = new Map()) {
    const calls = [], controls = [], dialogs = [];
    let nextToken = 0, dispose;
    const responses = { fetch_gamelist_gh_mirror: mirror, fetch_gamelist_from_discord: discord };
    const ref = value => ({ value });
    const context = vm.createContext({
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
        AbortController, tryOnScopeDispose(callback) { dispose = callback; },
        ref, watch() {}, tryOnMounted() {}, clearTimeout() {},
        setTimeout(callback) { callback(); return 1; },
        parseGameCatalog: catalog.parseGameCatalog, useGlobalState: () => ({ addLog() {} }),
        message: async (...args) => { dialogs.push(args); }, bundled,
        invoke: async command => {
            calls.push(command);
            const result = responses[command];
            if (result instanceof Error) throw result;
            return result;
        },
        // Match useAsyncState's error-ref behavior: execute catches rejections.
        useAsyncState: (fn, initial) => {
            const state = ref(initial), error = ref(), isReady = ref(false), isLoading = ref(false);
            return { state, error, isReady, isLoading, execute: async () => {
                state.value = initial; error.value = undefined; isReady.value = false; isLoading.value = true;
                try { state.value = await fn(); isReady.value = true; }
                catch (reason) { error.value = reason; }
                finally { isLoading.value = false; }
            } };
        },
    });
    Object.assign(context, loadRequests((command, payload) => {
        if (command === 'start_request') return Promise.resolve(`token-${++nextToken}`);
        if (command === 'cancel_request') { controls.push(payload); return Promise.resolve(); }
        return context.invoke(command, payload);
    }));
    const script = source.replace(/^import .*$/gm, '').replace(/^export /gm, '')
        .replace("import('../assets/gamelist.json')", 'Promise.resolve({ default: bundled })');
    vm.runInContext(ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
    return { api: context.useFetchGameList(), calls, responses, storage, controls, dialogs, dispose: () => dispose?.() };
}

for (const [name, response] of [
    ['request failure', new Error('Network unavailable')],
    ['HTTP failure', new Error('Game catalog HTTP error: 503')],
    ['oversized response', Object.assign(new Error('Game catalog exceeds the 16 MiB limit'), { code: 'too_large' })],
    ['JSON parsing failure', new Error('Invalid game catalog JSON')],
    ['non-array schema', { error: 'Unavailable' }],
    ['invalid later record', [game('Mirror'), { id: 'bad' }]],
    ['empty catalog', []],
]) {
    test(`${name} from the mirror triggers Discord fallback`, async () => {
        const { api, calls } = fixture(response);
        await api.fetchGameList();
        assert.deepEqual(calls, ['fetch_gamelist_gh_mirror', 'fetch_gamelist_from_discord']);
        assert.equal(api.gameDB.value[0].name, 'Discord');
        assert.equal(api.isReadyGH.value, false);
        assert.equal(api.isReadyDiscord.value, true);
    });
}

test('valid mirror data is preferred without contacting Discord', async () => {
    const { api, calls } = fixture([game('Mirror')]);
    await api.fetchGameList();
    assert.deepEqual(calls, ['fetch_gamelist_gh_mirror']);
    assert.equal(api.gameDB.value[0].name, 'Mirror');
});

for (const [failure, discord] of [
    ['request failure', new Error('Discord unavailable')], ['schema failure', {}], ['empty catalog', []],
    ['oversized response', Object.assign(new Error('Game catalog exceeds the 16 MiB limit'), { code: 'too_large' })],
]) {
    test(`Discord ${failure} uses the bundled catalog`, async () => {
        const { api } = fixture([], discord);
        await api.fetchGameList();
        assert.equal(api.gameDB.value[0].name, 'Bundled');
        assert.equal(api.isReadyDiscord.value, false);
    });
}

test('a successful refresh clears an earlier fetch error', async () => {
    const { api, responses } = fixture(new Error('Network unavailable'), [], []);
    await api.fetchGameList();
    assert.ok(api.fetchError.value);
    responses.fetch_gamelist_gh_mirror = [game('Recovered mirror')];
    await api.fetchGameList();
    assert.equal(api.fetchError.value, null);
    assert.equal(api.gameDB.value[0].name, 'Recovered mirror');
});

for (const [name, mirror, discord, bundled, cached, expected] of [
    ['mirror success', [game('Mirror')], [], [], [], 'fresh'],
    ['Discord fallback success', [], [game('Discord')], [], [], 'fresh'],
    ['cached fallback', [], [], [game('Bundled')], [game('Cached')], 'cached'],
    ['bundled fallback', [], [], [game('Bundled')], [], 'bundled'],
    ['complete failure', [], [], [], [], 'failed'],
]) {
    test(`final catalog outcome reflects ${name}`, async () => {
        const storage = cached.length ? new Map([[CACHE_KEY, JSON.stringify(cached)]]) : new Map();
        const { api, dialogs } = fixture(mirror, discord, bundled, storage);
        await api.fetchGameList();
        assert.equal(api.fetchOutcome.value, expected);
        assert.equal(api.allFetchDone.value, true);
        assert.equal(Boolean(api.fetchError.value), expected === 'failed');
        assert.equal(dialogs.length, expected === 'failed' ? 1 : 0);
    });
}

test('completion notifications distinguish final catalog outcomes', () => {
    const home = fs.readFileSync(new URL('../src/pages/HomeView.vue', import.meta.url), 'utf8');
    const watcher = home.slice(home.indexOf('let hasNotifiedFetchDone'), home.indexOf('function handleFocusSearchEvent'));
    const notifications = [];
    let onComplete;
    const context = vm.createContext({
        allFetchDone: { value: false }, fetchOutcome: { value: null },
        watch: (_ref, callback) => { onComplete = callback; },
        notify: (...args) => notifications.push(args),
    });
    vm.runInContext(ts.transpileModule(watcher, {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, context);
    for (const [outcome, type, text] of [
        ['fresh', 'success', 'Game list refreshed'],
        ['cached', 'info', 'Using cached game list'],
        ['bundled', 'info', 'Using bundled game list'],
        ['failed', 'error', 'No usable game list is available'],
    ]) {
        onComplete(false);
        context.fetchOutcome.value = outcome;
        onComplete(true);
        onComplete(true);
        assert.deepEqual(notifications.at(-1), [type, text]);
    }
    assert.equal(notifications.length, 4);
});

test('a valid mirror catalog is persisted without remote runtime fields', async () => {
    const { api, storage } = fixture([{ ...game('Mirror'), is_running: true, uid: 'remote' }]);
    await api.fetchGameList();
    const saved = JSON.parse(storage.get(CACHE_KEY));
    assert.equal(saved[0].name, 'Mirror');
    assert.equal(saved[0].is_running, undefined);
    assert.equal(saved[0].uid, undefined);
});

test('a valid Discord fallback refreshes the cache', async () => {
    const { api, storage } = fixture([]);
    await api.fetchGameList();
    assert.equal(JSON.parse(storage.get(CACHE_KEY))[0].name, 'Discord');
});

test('a new instance loads the last good catalog before an offline fetch with an empty bundle', async () => {
    const first = fixture([game('Last good')]);
    await first.api.fetchGameList();
    const next = fixture(new Error('Offline'), new Error('Offline'), [], first.storage);
    assert.equal(next.api.gameDB.value[0].name, 'Last good');
    await next.api.fetchGameList();
    assert.equal(next.api.gameDB.value[0].name, 'Last good');
});

test('cached data is preferred over an older bundled catalog', async () => {
    const storage = new Map([[CACHE_KEY, JSON.stringify([game('Cached')])]]);
    const { api } = fixture([], [], [game('Old bundle')], storage);
    await api.fetchGameList();
    assert.equal(api.gameDB.value[0].name, 'Cached');
    assert.equal(JSON.parse(storage.get(CACHE_KEY))[0].name, 'Cached');
});

for (const [failure, raw] of [
    ['malformed JSON', '{broken'],
    ['non-array schema', '{}'],
    ['empty catalog', '[]'],
    ['invalid later record', JSON.stringify([game('Valid first'), { id: 'bad' }])],
]) {
    test(`cached ${failure} is rejected as a whole`, async () => {
        const storage = new Map([[CACHE_KEY, raw]]);
        const { api } = fixture([], [], [], storage);
        await api.fetchGameList();
        assert.equal(api.gameDB.value.length, 0);
        assert.equal(storage.get(CACHE_KEY), raw);
    });
}

for (const [failure, mirror] of [
    ['invalid later record', [game('Good first'), { id: 'bad' }]], ['empty response', []],
]) {
    test(`a refresh with ${failure} preserves the persisted and in-memory catalog`, async () => {
        const { api, responses, storage } = fixture([game('Last good')], [], []);
        await api.fetchGameList();
        const previous = storage.get(CACHE_KEY);
        responses.fetch_gamelist_gh_mirror = mirror;
        await api.fetchGameList();
        assert.equal(api.gameDB.value[0].name, 'Last good');
        assert.equal(storage.get(CACHE_KEY), previous);
    });
}

test('a valid bundle seeds the cache when no remote or cached data is available', async () => {
    const { api, storage } = fixture([], [], [game('Bundled')]);
    await api.fetchGameList();
    assert.equal(JSON.parse(storage.get(CACHE_KEY))[0].name, 'Bundled');
});

test('an invalid later bundled record cannot replace cached data', async () => {
    const raw = JSON.stringify([game('Cached')]);
    const storage = new Map([[CACHE_KEY, raw]]);
    const { api } = fixture([], [], [game('Good first'), {}], storage);
    await api.fetchGameList();
    assert.equal(api.gameDB.value[0].name, 'Cached');
    assert.equal(storage.get(CACHE_KEY), raw);
});

test('storage write failures still retain a successful catalog across failed refreshes', async () => {
    const storage = { get() {}, set() { throw new Error('Quota exceeded'); } };
    const { api, responses } = fixture([game('In memory')], [], [], storage);
    await api.fetchGameList();
    assert.equal(api.gameDB.value[0].name, 'In memory');
    responses.fetch_gamelist_gh_mirror = [];
    await api.fetchGameList();
    assert.equal(api.gameDB.value[0].name, 'In memory');
});

test('unavailable storage does not prevent a successful remote fetch', async () => {
    const storage = { get() { throw new Error('Denied'); }, set() { throw new Error('Denied'); } };
    const { api } = fixture([game('Remote')], [], [], storage);
    await api.fetchGameList();
    assert.equal(api.gameDB.value[0].name, 'Remote');
});

test('an empty first-run catalog does not create a last-good cache', async () => {
    const { api, storage } = fixture([], [], []);
    await api.fetchGameList();
    assert.equal(api.gameDB.value.length, 0);
    assert.ok(api.fetchError.value);
    assert.equal(storage.has(CACHE_KEY), false);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
test('cancelling a refresh cancels native work and does not start Discord or overwrite cache', async () => {
    let resolveMirror;
    const raw = JSON.stringify([game('Cached')]);
    const storage = new Map([[CACHE_KEY, raw]]);
    const pending = new Promise(resolve => { resolveMirror = resolve; });
    const { api, calls, controls } = fixture(pending, [], [], storage);
    const refreshing = api.fetchGameList();
    await flush();
    api.cancelFetchGameList();
    await refreshing;
    assert.ok(controls.some(control => control.request_token === 'token-1'));
    assert.deepEqual(calls, ['fetch_gamelist_gh_mirror']);
    resolveMirror([game('Late mirror')]);
    await flush();
    assert.equal(api.gameDB.value[0].name, 'Cached');
    assert.equal(storage.get(CACHE_KEY), raw);
});

test('a newer refresh cancels the old one and publishes only the newer result', async () => {
    let resolveOld;
    const old = new Promise(resolve => { resolveOld = resolve; });
    const { api, responses, storage } = fixture(old, [], []);
    const first = api.fetchGameList();
    await flush();
    responses.fetch_gamelist_gh_mirror = [game('New result')];
    const second = api.fetchGameList();
    await Promise.all([first, second]);
    resolveOld([game('Stale result')]);
    await flush();
    assert.equal(api.gameDB.value[0].name, 'New result');
    assert.equal(JSON.parse(storage.get(CACHE_KEY))[0].name, 'New result');
});

test('disposing the view cancels its pending request', async () => {
    const { api, dispose, controls } = fixture(new Promise(() => {}), [], []);
    const refreshing = api.fetchGameList();
    await flush();
    dispose();
    await refreshing;
    assert.ok(controls.some(control => control.request_token === 'token-1'));
});
