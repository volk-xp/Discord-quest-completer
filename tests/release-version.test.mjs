import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { artifactVersion, checkRelease, checkVersion, compareVersions, syncVersion, updaterManifest } from '../scripts/release-version.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
function fixture(t, version = '25.10.8') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dqc release versions '));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'src-tauri'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
    fs.writeFileSync(path.join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "discord-quest-completer"\nversion = "25.10.7"\n');
    fs.writeFileSync(path.join(root, 'src-tauri/Cargo.lock'), '[[package]]\nname = "discord-quest-completer"\nversion = "25.10.7"\n\n[[package]]\nname = "other"\nversion = "1.2.3"\n');
    fs.writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '25.4.18', plugins: { updater: { allowDowngrades: false } } }));
    return root;
}

test('checked-in application metadata uses one version newer than existing 25.x installations', () => {
    const version = checkVersion(project);
    assert.equal(compareVersions(version, '25.10.7'), 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'src-tauri/tauri.conf.json'))).version, '../package.json');
});

test('release versions compare numerically and reject ambiguous or prerelease source versions', () => {
    assert.equal(compareVersions('25.10.10', '25.10.9'), 1);
    assert.equal(compareVersions('25.10.8', '25.10.8'), 0);
    assert.equal(compareVersions('1.0.999999', '25.4.18'), -1);
    for (const version of ['25.01.0', 'v25.10.8', '25.10', '25.10.8-beta.1', '25.10.8+build', '25.10.8\n']) {
        assert.throws(() => compareVersions(version, '25.10.7'), /stable/);
    }
});

test('synchronization updates Cargo and its local lock entry without changing dependency versions or updater policy', t => {
    const root = fixture(t);
    assert.throws(() => checkVersion(root), /versions disagree/);
    assert.equal(syncVersion(root), '25.10.8');
    assert.equal(syncVersion(root), '25.10.8');
    assert.match(fs.readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8'), /name = "other"\nversion = "1.2.3"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'))).plugins.updater.allowDowngrades, false);
});

test('synchronization refuses decreasing package versions before writing derived files', t => {
    const root = fixture(t, '1.0.999999');
    const before = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
    assert.throws(() => syncVersion(root), /must not decrease/);
    assert.equal(fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'), before);
});

test('release guard checks every API page and rejects equal or higher existing versions including drafts', t => {
    const root = fixture(t);
    syncVersion(root);
    assert.equal(checkRelease(root, [[{ tag_name: '1.0.999' }], [{ tag_name: 'v25.10.7' }]]), '25.10.8');
    for (const release of [{ tag_name: '25.10.8' }, { tag_name: '25.10.8', draft: true }, { tag_name: 'v25.10.9' }]) {
        assert.throws(() => checkRelease(root, [[{ tag_name: '1.0.999' }], [release]]), /must be newer/);
    }
});

test('release guard fails closed on malformed release data', t => {
    const root = fixture(t);
    syncVersion(root);
    for (const records of [{}, [null], [{}], [{ tag_name: 'unknown-stable-tag' }]]) {
        assert.throws(() => checkRelease(root, records));
    }
    assert.equal(checkRelease(root, []), '25.10.8');
});

test('staged artifacts must match the canonical version', t => {
    const root = fixture(t);
    syncVersion(root);
    const file = path.join(root, 'version.txt');
    fs.writeFileSync(file, '\ufeff25.10.8\r\n');
    assert.equal(artifactVersion(root, file), '25.10.8');
    fs.writeFileSync(file, '1.0.999');
    assert.throws(() => artifactVersion(root, file), /Artifact version/);
});

test('updater manifests use the same version in metadata and the tagged download URL', () => {
    const manifest = updaterManifest('25.10.8', 'owner/repo', 'signature\n', '2026-10-27T00:00:00Z');
    assert.equal(manifest.version, '25.10.8');
    assert.equal(manifest.platforms['windows-x86_64'].url, 'https://github.com/owner/repo/releases/download/25.10.8/discord-quest-completer-setup.exe');
    assert.equal(manifest.platforms['windows-x86_64'].signature, 'signature');
    assert.throws(() => updaterManifest('25.10.8', 'owner/repo', ''), /signature/);
    assert.throws(() => updaterManifest('25.10.8', '../repo/path', 'signature'), /repository/);
});

test('release CLI generates consistent metadata and refuses a mismatched artifact without overwriting it', t => {
    const root = fixture(t);
    syncVersion(root);
    const script = path.join(root, 'scripts/release-version.mjs');
    fs.mkdirSync(path.dirname(script));
    fs.copyFileSync(path.join(project, 'scripts/release-version.mjs'), script);
    fs.writeFileSync(path.join(root, 'releases.json'), JSON.stringify([[{ tag_name: '25.10.7' }]]));
    fs.writeFileSync(path.join(root, 'version.txt'), '25.10.8\n');
    fs.writeFileSync(path.join(root, 'installer.sig'), 'signed-installer\n');
    const run = (...args) => spawnSync(process.execPath, [script, ...args], {
        cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo' },
    });
    const release = run('release', 'releases.json');
    assert.equal(release.status, 0, release.stderr);
    assert.equal(release.stdout.trim(), '25.10.8');
    const generated = run('manifest', 'version.txt', 'installer.sig', 'latest.json');
    assert.equal(generated.status, 0, generated.stderr);
    const before = fs.readFileSync(path.join(root, 'latest.json'), 'utf8');
    assert.equal(JSON.parse(before).version, '25.10.8');
    fs.writeFileSync(path.join(root, 'version.txt'), '1.0.999');
    assert.equal(run('manifest', 'version.txt', 'installer.sig', 'latest.json').status, 1);
    assert.equal(fs.readFileSync(path.join(root, 'latest.json'), 'utf8'), before);
});

test('release workflows use canonical checks, serialized publication, and generated updater metadata', () => {
    const workflow = fs.readFileSync(path.join(project, '.github/workflows/build-release.yaml'), 'utf8');
    assert.doesNotMatch(workflow, /github\.run_number|compute version|patch tauri\.conf\.json version/);
    assert.match(workflow, /concurrency:\r?\n  group: publish\r?\n  cancel-in-progress: false/);
    assert.equal([...workflow.matchAll(/node scripts\/release-version\.mjs release release-versions\.json/g)].length, 2);
    assert.equal([...workflow.matchAll(/gh api --paginate --slurp/g)].length, 2);
    assert.match(workflow, /node scripts\/release-version\.mjs artifact tauri-win-release\/version\.txt/);
    assert.match(workflow, /node scripts\/release-version\.mjs manifest tauri-win-release\/version\.txt/);
    assert.match(workflow, /tag_name: \$\{\{ env\.version \}\}/);
    const checks = fs.readFileSync(path.join(project, '.github/workflows/rust-check.yml'), 'utf8');
    assert.doesNotMatch(checks, /version=\$\(date/);
    assert.match(checks, /version=\$\(node scripts\/release-version\.mjs check\)/);
});


test('release guard accepts the original V.1.0 tag but rejects unknown legacy spellings', t => {
    const root = fixture(t);
    syncVersion(root);
    assert.equal(checkRelease(root, [{ tag_name: 'V.1.0' }, { tag_name: '1.0.15' }]), '25.10.8');
    assert.throws(() => checkRelease(root, [{ tag_name: 'V.2.0' }]));
});

test('the checked-in updater downloads from this repository', () => {
    const config = JSON.parse(fs.readFileSync(path.join(project, 'src-tauri/tauri.conf.json')));
    assert.deepEqual(config.plugins.updater.endpoints, ['https://github.com/volk-xp/Discord-quest-completer/releases/latest/download/latest.json']);
});
