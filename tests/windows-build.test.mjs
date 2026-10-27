import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareRunner } from '../scripts/prepare-runner.mjs';

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dqc build with spaces '));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'src-win/target/x86_64-pc-windows-msvc/release/src-win.exe');
    const destination = path.join(root, 'src-tauri/resources/src-win.exe');
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'fresh helper');
    return { root, source, destination };
}

test('Windows preparation builds the locked helper and copies it into a new resources directory', t => {
    const { root, destination } = fixture(t);
    prepareRunner(root, (command, args, options) => {
        assert.equal(command, 'cargo');
        assert.deepEqual(args, ['build', '--release', '--locked', '--manifest-path',
            path.join(root, 'src-win/Cargo.toml'), '--target', 'x86_64-pc-windows-msvc',
            '--target-dir', path.join(root, 'src-win/target')]);
        assert.equal(options.cwd, root);
        assert.equal(options.shell, undefined);
        assert.equal(fs.existsSync(destination), false);
        return { status: 0 };
    });
    assert.equal(fs.readFileSync(destination, 'utf8'), 'fresh helper');
});

test('failed or interrupted helper builds never replace an existing resource with a stale artifact', t => {
    const { root, destination } = fixture(t);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, 'previous helper');
    for (const result of [{ status: 1 }, { status: null, signal: 'SIGTERM' },
        { error: new Error('cargo not found') }]) {
        assert.throws(() => prepareRunner(root, () => result), /failed|cargo not found/);
        assert.equal(fs.readFileSync(destination, 'utf8'), 'previous helper');
    }
});

test('a missing helper artifact fails preparation rather than continuing the app build', t => {
    const { root, source, destination } = fixture(t);
    fs.unlinkSync(source);
    assert.throws(() => prepareRunner(root, () => ({ status: 0 })), /ENOENT/);
    assert.equal(fs.existsSync(destination), false);
});

test('all pnpm script references and Tauri hooks resolve without template or shell copy commands', () => {
    const { scripts } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const config = JSON.parse(fs.readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
    for (const command of [...Object.values(scripts), config.build.beforeDevCommand, config.build.beforeBuildCommand]) {
        assert.doesNotMatch(command, /\b(?:cp|copy:template|build:template)\b/);
        for (const [, script] of command.matchAll(/\bpnpm (?:run )?([\w:-]+)/g)) {
            assert.ok(Object.hasOwn(scripts, script), `Missing pnpm script: ${script}`);
        }
    }
    assert.equal(scripts['build:runner:win'], 'node scripts/prepare-runner.mjs');
    assert.match(config.build.beforeDevCommand, /^pnpm version:check && pnpm sync:runner && pnpm dev$/);
    assert.match(config.build.beforeBuildCommand, /^pnpm version:check && pnpm sync:runner && pnpm build$/);
    assert.equal(scripts['tauri:dev'], 'tauri dev');
    assert.match(scripts['tauri:build'], /^tauri build --config src-tauri\/tauri.check.conf.json$/);
    const localConfig = JSON.parse(fs.readFileSync(new URL('../src-tauri/tauri.check.conf.json', import.meta.url), 'utf8'));
    assert.equal(localConfig.bundle.createUpdaterArtifacts, false);
});
