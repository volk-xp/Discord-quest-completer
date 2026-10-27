import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { catalog } from './catalog-loader.mjs';

const { executableParts, launchExecutable, gamePathPayload, parseGameCatalog, isValidAppId } = catalog;
const executable = { name: 'bin/game.exe', os: 'win32', is_launcher: false };
const game = { id: '123456789012345678', name: 'Fixture', executables: [executable] };

test('both separators and ordinary Unicode names work', () => {
    for (const name of ['bin/game.exe', 'bin\\game.exe', 'Game Folder/日本語.EXE', 'game.exe']) {
        assert.ok(executableParts(name), name);
        assert.ok(launchExecutable({ ...executable, name }), name);
    }
});

const unsafePaths = ['', '.', '..', '../game.exe', 'bin/../../game.exe', 'bin/../game.exe',
    'bin\\..\\game.exe', '/game.exe', '\\game.exe', 'C:\\game.exe', 'C:game.exe',
    '\\\\server\\share\\game.exe', '\\\\?\\C:\\game.exe', 'bin//game.exe', 'bin\\\\game.exe',
    'bin/./game.exe', 'bin /game.exe', 'bin./game.exe', 'game.exe ', 'game.exe.',
    'game.exe:payload', 'game.exe:payload.exe', 'CON.exe', 'aux.txt/game.exe', 'LPT¹.exe',
    'COM1 /game.exe', 'NUL/game.exe', 'CONIN$.exe', 'bin/*/game.exe', 'ga?me.exe',
    'bad\u0000.exe', 'bad\u001f.exe', 'bad\u007f.exe', 'bad|name.exe', 'game.bat',
    `${'a'.repeat(256)}.exe`, `${'bin/'.repeat(1024)}game.exe`];
test('reject Windows traversal, devices, streams, absolute and ambiguous paths', () => {
    for (const name of unsafePaths) {
        assert.equal(executableParts(name), null, JSON.stringify(name));
        assert.equal(launchExecutable({ ...executable, name }), null, JSON.stringify(name));
        assert.throws(() => gamePathPayload(game.id, { ...executable, name }));
    }
    assert.equal(launchExecutable({ ...executable, os: 'linux' }), null);
});

test('IDs stay exact strings across the native command boundary', () => {
    assert.deepEqual(gamePathPayload(game.id, { ...executable, path: '../../outside', filename: 'x.exe' }),
        { app_id: game.id, executable_name: 'bin/game.exe' });
    assert.equal(isValidAppId('18446744073709551615'), true);
    for (const id of ['0', '01', '-1', '+1', '1.0', '../1', '18446744073709551616', '', 123]) {
        assert.equal(isValidAppId(id), false, String(id));
        assert.throws(() => gamePathPayload(id, executable));
    }
});

test('every record is checked, not only the first record', () => {
    for (const bad of [null, {}, { ...game, id: '../1' }, { ...game, name: '' },
        { ...game, executables: null }, { ...game, executables: [null] },
        { ...game, executables: [{ ...executable, is_launcher: 'yes' }] },
        { ...game, aliases: [42] }]) {
        assert.throws(() => parseGameCatalog([game, bad]));
    }
    assert.throws(() => parseGameCatalog({}));
});

test('catalog and persisted favorites cannot inject derived paths or runtime state', () => {
    const malicious = { ...game, uid: 'local-uid', is_running: true, is_installed: true,
        executables: [{ ...executable, path: '../../outside', filename: 'outside.exe',
            segments: 99, is_installed: true, is_running: true }] };
    const [remote] = parseGameCatalog([malicious]);
    const [favorite] = parseGameCatalog([malicious], true);
    assert.equal(remote.uid, undefined);
    assert.equal(favorite.uid, 'local-uid');
    for (const parsed of [remote, favorite]) {
        assert.equal(parsed.is_running, undefined);
        assert.equal(parsed.is_installed, undefined);
        assert.deepEqual(parsed.executables, [executable]);
    }
    assert.notEqual(favorite.executables[0], malicious.executables[0]);
});

test('unsupported executable patterns are omitted while safe entries remain', () => {
    const [parsed] = parseGameCatalog([{ ...game, executables: [executable,
        { ...executable, name: '../outside.exe' }, { ...executable, name: 'wild*/game.exe' },
        { name: 'game', os: 'linux' }, { name: 'game', os: 'unknown' }] }]);
    assert.deepEqual(parsed.executables.map(item => item.os), ['win32', 'linux']);
});

test('the bundled catalog remains readable', () => {
    const bundled = JSON.parse(fs.readFileSync(new URL('../src/assets/gamelist.json', import.meta.url), 'utf8'));
    assert.equal(parseGameCatalog(bundled).length, bundled.length);
});
