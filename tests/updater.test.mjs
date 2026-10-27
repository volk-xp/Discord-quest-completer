import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = name => fs.readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''), {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
    const checks = [], installs = [];
    let restarted = 0, closed = 0;
    const context = vm.createContext({
        ref: value => ({value}), shallowRef: value => ({value}),
        check: options => new Promise((resolve,reject) => checks.push({options,resolve,reject})),
        relaunch: async () => { restarted++; },
    });
    vm.runInContext(transpile(read('composables/use-updater.ts')),context);
    const api = context.useUpdater();
    const update = {
        close: async () => { closed++; },
        version:'25.10.9', body:'Updater reliability', date:'2026-10-27T00:00:00Z',
        downloadAndInstall: callback => new Promise((resolve,reject) => installs.push({callback,resolve,reject})),
    };
    return {api,checks,installs,update,restarted:()=>restarted,closed:()=>closed};
}

test('a failed update check is visible, clears stale update ownership, and can be retried', async () => {
    const {api,checks,update,closed} = fixture();
    const first = api.checkForUpdate();
    checks[0].resolve(update); await first;
    assert.equal(api.pendingUpdate.value,update);
    const second = api.checkForUpdate();
    await flush();
    assert.equal(closed(),1);
    checks[1].reject('Network unavailable'); await second;
    assert.equal(api.checkError.value,'Network unavailable');
    assert.equal(api.pendingUpdate.value,null);
    assert.equal(api.latestVersion.value,null);
    assert.equal(api.hasChecked.value,true);
    const retry = api.checkForUpdate();
    assert.equal(api.checkError.value,null);
    checks[2].resolve(update); await retry;
    assert.equal(api.updateAvailable.value,true);
    assert.equal(api.latestVersion.value,'25.10.9');
    assert.equal(checks[2].options.timeout,15000);
});

test('concurrent automatic and manual checks share one native request', async () => {
    const {api,checks} = fixture();
    const first = api.checkForUpdate();
    const concurrent = api.checkForUpdate();
    assert.equal(checks.length,1);
    checks[0].resolve(null); await first; await concurrent;
    assert.equal(api.isChecking.value,false);
    assert.equal(api.hasChecked.value,true);
    assert.equal(api.updateAvailable.value,false);
});

test('installation blocks duplicate installs and checks and only restarts after success', async () => {
    const {api,checks,installs,update,restarted} = fixture();
    const checking = api.checkForUpdate(); checks[0].resolve(update); await checking;
    const installation = api.installUpdate();
    await api.installUpdate(); await api.checkForUpdate();
    assert.equal(installs.length,1); assert.equal(checks.length,1);
    installs[0].callback({event:'Started',data:{contentLength:100}});
    installs[0].callback({event:'Progress',data:{chunkLength:25}});
    assert.equal(api.downloadProgress.value,25);
    installs[0].reject('Download failed'); await installation;
    assert.equal(api.isDownloading.value,false);
    assert.equal(api.installError.value,'Download failed'); assert.equal(restarted(),0);
    const retry = api.installUpdate(); installs[1].resolve(); await retry;
    assert.equal(restarted(),1);
});

test('automatic checks run on startup, periodically, after reconnect and on return, then clean up', async () => {
    const source = read('components/UpdateBanner.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
    const online = new Map(), visibility = new Map(), timers = new Map();
    let mount, unmount, count = 0;
    const context = vm.createContext({
        ref: value => ({value}), useUpdater: () => ({checkForUpdate:async()=>{count++;}}),
        onMounted: callback => {mount=callback;}, onUnmounted: callback => {unmount=callback;},
        setInterval: (callback,delay) => {timers.set(1,{callback,delay});return 1;}, clearInterval:id=>timers.delete(id),
        window:{addEventListener:(name,callback)=>online.set(name,callback),removeEventListener:name=>online.delete(name)},
        document:{visibilityState:'visible',addEventListener:(name,callback)=>visibility.set(name,callback),removeEventListener:name=>visibility.delete(name)},
    });
    vm.runInContext(transpile(source),context);
    mount(); await flush(); assert.equal(count,1);
    assert.equal(timers.get(1).delay,15*60*1000);
    await timers.get(1).callback(); assert.equal(count,2);
    await online.get('online')(); assert.equal(count,3);
    context.document.visibilityState='hidden'; visibility.get('visibilitychange')(); assert.equal(count,3);
    context.document.visibilityState='visible'; visibility.get('visibilitychange')(); assert.equal(count,4);
    unmount(); assert.equal(timers.size,0); assert.equal(online.size,0); assert.equal(visibility.size,0);
});

test('settings expose check status, errors, retry and install controls', () => {
    const settings = read('pages/SettingsView.vue');
    assert.match(settings,/@click="checkForUpdate"/);
    assert.match(settings,/v-if="checkError"[^>]*role="alert"/);
    assert.match(settings,/hasChecked/);
    assert.match(settings,/@click="installUpdate"/);
    assert.match(settings,/Check for updates/);
});
