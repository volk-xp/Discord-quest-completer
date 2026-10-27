import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRequests } from './requests-loader.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function fixture(delayRegistration = false) {
    const registration = deferred(), work = deferred(), calls = [];
    let deadline, cleared = false;
    const api = loadRequests((command, payload) => {
        calls.push({ command, payload });
        if (command === 'start_request') return delayRegistration ? registration.promise : Promise.resolve('token-1');
        if (command === 'cancel_request') return Promise.resolve();
        return work.promise;
    }, { setTimeout: callback => { deadline = callback; return 1; }, clearTimeout: () => { cleared = true; } });
    return { ...api, calls, work, registration, deadline: () => deadline(), cleared: () => cleared };
}

test('aborting an in-flight request sends native cancellation and ignores late success', async () => {
    const f = fixture(), controller = new AbortController();
    const result = f.invokeRequest('fetch_catalog', {}, controller.signal);
    await flush();
    controller.abort();
    await assert.rejects(result, error => error.code === 'cancelled');
    assert.ok(f.calls.some(call => call.command === 'cancel_request' && call.payload.request_token === 'token-1'));
    f.work.resolve(['late data']);
    assert.equal(f.cleared(), true);
});

test('cancellation before registration finishes cancels its late native token without starting work', async () => {
    const f = fixture(true), controller = new AbortController();
    const result = f.invokeRequest('fetch_catalog', {}, controller.signal);
    controller.abort();
    await assert.rejects(result, error => error.code === 'cancelled');
    f.registration.resolve('late-token');
    await flush();
    assert.equal(f.calls.some(call => call.command === 'fetch_catalog'), false);
    assert.ok(f.calls.some(call => call.command === 'cancel_request' && call.payload.request_token === 'late-token'));
});

test('a deadline cancels native work and returns a structured timeout', async () => {
    const f = fixture();
    const result = f.invokeRequest('connect_rpc');
    await flush();
    f.deadline();
    await assert.rejects(result, error => error.code === 'timeout' && /timed out/.test(error.message));
    assert.ok(f.calls.some(call => call.command === 'cancel_request'));
});

test('registration itself is bounded, and a late registration is reclaimed', async () => {
    const f = fixture(true);
    const result = f.invokeRequest('connect_rpc');
    f.deadline();
    await assert.rejects(result, error => error.code === 'timeout');
    f.registration.resolve('late-token');
    await flush();
    assert.ok(f.calls.some(call => call.command === 'cancel_request' && call.payload.request_token === 'late-token'));
    assert.equal(f.calls.some(call => call.command === 'connect_rpc'), false);
});

test('structured HTTP errors retain their code, message and status', async () => {
    const f = fixture();
    const result = f.invokeRequest('fetch_catalog');
    await flush();
    f.work.reject({ code: 'http', message: 'Mirror unavailable', status: 503 });
    await assert.rejects(result, error => error.code === 'http' && error.status === 503 && error.message === 'Mirror unavailable');
    assert.equal(f.cleared(), true);
});

test('already aborted requests do not register any native work', async () => {
    const f = fixture(), controller = new AbortController();
    controller.abort();
    await assert.rejects(f.invokeRequest('fetch_catalog', {}, controller.signal), error => error.code === 'cancelled');
    assert.equal(f.calls.length, 0);
});

test('successful RPC confirmation does not cancel its newly connected session', async () => {
    const f = fixture();
    const result = f.invokeRequest('connect_rpc');
    await flush();
    f.work.resolve('connected');
    assert.equal(await result, 'connected');
    assert.equal(f.calls.some(call => call.command === 'cancel_request'), false);
});

test('RPC listener setup is bounded and cannot start a request after cancellation', async () => {
    const f = fixture(), ready = deferred();
    const result = f.invokeRequest('connect_rpc', {}, undefined, ready.promise);
    f.deadline();
    await assert.rejects(result, error => error.code === 'timeout');
    ready.resolve();
    await flush();
    assert.equal(f.calls.length, 0);
});
