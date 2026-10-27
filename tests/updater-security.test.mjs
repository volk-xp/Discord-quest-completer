import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('package.json'));
const cargo = read('src-tauri/Cargo.toml');
const rustLock = read('src-tauri/Cargo.lock');
const jsLock = read('pnpm-lock.yaml');

function assertPatched(value) {
    const match = value?.replace(/^[~^=]/, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
    assert.ok(match, `Expected a stable updater version: ${value}`);
    const [, major, minor] = match.map(Number);
    assert.ok(major > 2 || (major === 2 && minor >= 12), `Updater ${value} predates the 2.12.0 security fix`);
}

test('both updater manifests require the security fix and both lockfiles resolve matching patched versions', () => {
    const rustMinimum = cargo.match(/^tauri-plugin-updater\s*=\s*"([^"]+)"/m)?.[1];
    const rustVersion = rustLock.match(/^name = "tauri-plugin-updater"\r?\nversion = "([^"]+)"/m)?.[1];
    const jsEntry = jsLock.match(/^  '@tauri-apps\/plugin-updater':\r?\n    specifier: ([^\r\n]+)\r?\n    version: ([^\r\n]+)/m);
    assert.ok(jsEntry, 'JavaScript updater must be present in pnpm-lock.yaml');
    for (const version of [rustMinimum, manifest.dependencies['@tauri-apps/plugin-updater'], rustVersion, jsEntry[2]]) {
        assertPatched(version);
    }
    assert.equal(jsEntry[1], manifest.dependencies['@tauri-apps/plugin-updater']);
    assert.equal(rustVersion, jsEntry[2], 'Rust updater and JavaScript bindings must match');
});

test('downgrades are explicitly disabled and no Tauri config enables them', () => {
    const base = JSON.parse(read('src-tauri/tauri.conf.json'));
    assert.equal(base.plugins.updater.allowDowngrades, false);
    for (const file of fs.readdirSync(new URL('../src-tauri/', import.meta.url))) {
        if (!/^tauri(?:\..+)?\.conf\.json$/.test(file)) continue;
        const override = JSON.parse(read(`src-tauri/${file}`)).plugins?.updater;
        assert.equal(override?.allowDowngrades ?? false, false, file);
    }
    assert.doesNotMatch(read('src-tauri/src/lib.rs'), /\.version_comparator\s*\(/);
});

test('the frontend checks for updates without requesting a relaxed version policy', async () => {
    const source = read('src/composables/use-updater.ts');
    const checkSource = source.slice(source.indexOf('async function checkForUpdate()'), source.indexOf('function dismissUpdate()'));
    assert.ok(checkSource.length, 'Expected the update-check function');
    const calls = [];
    const state = Object.fromEntries(['isChecking', 'checkError', 'updateAvailable', 'latestVersion',
        'releaseNotes', 'releaseDate', 'pendingUpdate'].map(name => [name, { value: null }]));
    const context = vm.createContext({ ...state, check: async (...args) => { calls.push(args); return null; } });
    vm.runInContext(checkSource, context);
    await context.checkForUpdate();
    assert.deepEqual(calls, [[]]);
    assert.equal(state.isChecking.value, false);
    assert.equal(state.updateAvailable.value, false);
});
