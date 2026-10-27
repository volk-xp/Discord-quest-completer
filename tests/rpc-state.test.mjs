import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { loadRequests } from './requests-loader.mjs';

const source = fs.readFileSync(new URL('../src/composables/use-rpc-state.ts', import.meta.url), 'utf8');
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function fixture({ registration } = {}) {
    const calls = [];
    let nextToken = 0;
    const controls = [];
    let handler, listeners = 0, nextId = 0, unlistened = 0;
    const disposals = [];
    const context = vm.createContext({
        AbortController,
        ref: value => ({ value }), computed: getter => ({ get value() { return getter(); } }),
        onScopeDispose: callback => disposals.push(callback),
        crypto: { randomUUID: () => String(++nextId) },
        listen: async (_, callback) => {
            listeners++;
            handler = callback;
            if (registration && listeners === 1) await registration.promise;
            return () => { unlistened++; };
        },
        invoke: (command, payload) => {
            const pending = deferred();
            calls.push({ command, payload, ...pending });
            return pending.promise;
        },
    });
    Object.assign(context, loadRequests((command, payload) => {
        if (command === 'start_request') return Promise.resolve(`token-${++nextToken}`);
        if (command === 'cancel_request') { controls.push(payload); return Promise.resolve(); }
        return context.invoke(command, payload);
    }));
    vm.runInContext(ts.transpileModule(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText, context);
    return {
        api: context.useRpcState(), calls, controls,
        disconnected: (requestId, error = 'Discord closed') => handler({ payload: { request_id: requestId, error } }),
        listeners: () => listeners,
        unlistened: () => unlistened,
        useRpcState: () => context.useRpcState(),
        dispose: () => disposals.shift()(),
    };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('shared consumers register once and only the last disposal removes the listener', async () => {
    const { api, calls, listeners, unlistened, useRpcState, dispose } = fixture();
    useRpcState();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await connecting;
    dispose();
    await flush();
    assert.equal(listeners(), 1);
    assert.equal(unlistened(), 0);
    assert.equal(api.isConnectedToRPC.value, true);
    dispose();
    await flush();
    assert.equal(unlistened(), 1);
    assert.equal(api.isConnectedToRPC.value, false);
    const remounted = useRpcState().connectRpc({ app_id: '456' });
    await flush();
    calls[1].resolve();
    assert.equal(await remounted, true);
    assert.equal(listeners(), 2);
    dispose();
    await flush();
    assert.equal(unlistened(), 2);
});

test('disposing during listener registration cancels connection and removes the late listener', async () => {
    const registration = deferred();
    const { api, calls, dispose, unlistened } = fixture({ registration });
    const connecting = api.connectRpc({ app_id: '123' });
    dispose();
    assert.equal(await connecting, false);
    registration.resolve();
    await flush();
    assert.equal(calls.length, 0);
    assert.equal(unlistened(), 1);
    assert.equal(api.isConnecting.value, false);
});

test('a failed listener registration can be retried', async () => {
    const registration = deferred();
    const { api, calls, listeners } = fixture({ registration });
    const first = api.connectRpc({ app_id: '123' });
    registration.reject('Listener unavailable');
    assert.equal(await first, false);
    assert.equal(api.rpcError.value, 'Listener unavailable');
    assert.equal(calls.length, 0);
    const second = api.connectRpc({ app_id: '456' });
    await flush();
    calls[0].resolve();
    assert.equal(await second, true);
    assert.equal(listeners(), 2);
});

test('RPC remains connecting until the backend confirms the activity', async () => {
    const { api, calls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    assert.equal(api.isConnecting.value, true);
    assert.equal(api.isConnectedToRPC.value, false);
    calls[0].resolve();
    assert.equal(await connecting, true);
    assert.equal(api.isConnectedToRPC.value, true);
    assert.equal(api.isConnecting.value, false);
});

test('backend rejection clears connecting and reports the error', async () => {
    const { api, calls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].reject('Discord unavailable');
    assert.equal(await connecting, false);
    assert.equal(api.isConnectedToRPC.value, false);
    assert.equal(api.isConnecting.value, false);
    assert.equal(api.rpcError.value, 'Discord unavailable');
});

test('disconnect event before the result prevents a false connected state', async () => {
    const { api, calls, disconnected } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    disconnected(calls[0].payload.request_id);
    calls[0].resolve();
    assert.equal(await connecting, false);
    assert.equal(api.isConnectedToRPC.value, false);
    assert.equal(api.rpcError.value, 'Discord closed');
});

test('cancellation ignores a late successful connection result', async () => {
    const { api, calls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    const disconnecting = api.disconnectRpc();
    calls[0].resolve();
    assert.equal(await connecting, false);
    assert.equal(api.isConnectedToRPC.value, false);
    assert.equal(api.isDisconnecting.value, true);
    await flush();
    calls[1].resolve();
    assert.equal(await disconnecting, true);
    assert.equal(api.isDisconnecting.value, false);
});

test('disconnect remains pending until the backend finishes', async () => {
    const { api, calls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await connecting;
    const disconnecting = api.disconnectRpc();
    assert.equal(api.isConnectedToRPC.value, true);
    await flush();
    calls[1].resolve();
    await disconnecting;
    assert.equal(api.isConnectedToRPC.value, false);
});

test('connection loss clears confirmed status and old events cannot clear a new connection', async () => {
    const { api, calls, disconnected, listeners } = fixture();
    const first = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await first;
    disconnected(calls[0].payload.request_id);
    assert.equal(api.isConnectedToRPC.value, false);
    const second = api.connectRpc({ app_id: '456' });
    await flush();
    await flush();
    calls[1].resolve();
    await second;
    disconnected(calls[0].payload.request_id);
    assert.equal(api.isConnectedToRPC.value, true);
    assert.equal(listeners(), 1);
});

test('failed disconnect reconciles released backend ownership and permits reconnection', async () => {
    const { api, calls, disconnected } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await connecting;
    const disconnecting = api.disconnectRpc();
    await flush();
    calls[1].reject({ code: 'timeout', message: 'Timed out closing Discord connection' });
    await flush();
    assert.equal(calls[2].command, 'rpc_connection_id');
    assert.equal(api.isDisconnecting.value, true);
    calls[2].resolve(null);
    assert.equal(await disconnecting, false);
    assert.equal(api.isConnectedToRPC.value, false);
    assert.equal(api.isDisconnecting.value, false);
    assert.equal(api.rpcError.value, 'Timed out closing Discord connection');
    const reconnecting = api.connectRpc({ app_id: '456' });
    await flush();
    calls[3].resolve();
    assert.equal(await reconnecting, true);
    disconnected(calls[0].payload.request_id);
    assert.equal(api.isConnectedToRPC.value, true);
});

test('failed disconnect preserves Connected only when the backend still owns the connection', async () => {
    const { api, calls, disconnected } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await connecting;
    const disconnecting = api.disconnectRpc();
    await flush();
    calls[1].reject('IPC failed before disconnect');
    await flush();
    assert.equal(calls[2].command, 'rpc_connection_id');
    assert.equal(api.isConnectedToRPC.value, true);
    calls[2].resolve(calls[0].payload.request_id);
    assert.equal(await disconnecting, false);
    assert.equal(api.isConnectedToRPC.value, true);
    assert.equal(api.rpcError.value, 'IPC failed before disconnect');
    disconnected(calls[0].payload.request_id);
    assert.equal(api.isConnectedToRPC.value, false);
});

test('failed ownership reconciliation cannot preserve an unconfirmed Connected indicator', async () => {
    const { api, calls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await connecting;
    const disconnecting = api.disconnectRpc();
    await flush();
    calls[1].reject('Disconnect failed');
    await flush();
    assert.equal(calls[2].command, 'rpc_connection_id');
    calls[2].reject('Status unavailable');
    assert.equal(await disconnecting, false);
    assert.equal(api.isConnectedToRPC.value, false);
    assert.equal(api.isDisconnecting.value, false);
    assert.equal(api.rpcError.value, 'Disconnect failed');
});

for (const change of ['connection loss', 'last consumer disposal']) {
    test(`${change} during reconciliation prevents a late status response reviving Connected`, async () => {
        const { api, calls, disconnected, dispose } = fixture();
        const connecting = api.connectRpc({ app_id: '123' });
        await flush();
        calls[0].resolve();
        await connecting;
        const disconnecting = api.disconnectRpc();
        await flush();
        calls[1].reject('Disconnect failed');
        await flush();
        if (change === 'connection loss') disconnected(calls[0].payload.request_id);
        else dispose();
        calls[2].resolve(calls[0].payload.request_id);
        assert.equal(await disconnecting, false);
        assert.equal(api.isConnectedToRPC.value, false);
    });
}

test('structured backend failures display their message', async () => {
    const { api, calls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].reject({ code: 'timeout', message: 'Discord timed out' });
    await connecting;
    assert.equal(api.rpcError.value, 'Discord timed out');
});

test('cancelling a pending connection reaches native work before that work returns', async () => {
    const { api, calls, controls } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    const disconnecting = api.disconnectRpc();
    assert.equal(await connecting, false);
    assert.ok(controls.some(control => control.request_token === 'token-1'));
    await flush();
    calls[1].resolve();
    await disconnecting;
    assert.equal(api.rpcError.value, null);
});

test('structured connection-loss events clear status and preserve their message', async () => {
    const { api, calls, disconnected } = fixture();
    const connecting = api.connectRpc({ app_id: '123' });
    await flush();
    calls[0].resolve();
    await connecting;
    disconnected(calls[0].payload.request_id, { code: 'rpc', message: 'Discord exited' });
    assert.equal(api.isConnectedToRPC.value, false);
    assert.equal(api.rpcError.value, 'Discord exited');
});
