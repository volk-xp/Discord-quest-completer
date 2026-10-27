import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const cargoVersion = /(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
const lockedVersion = /(^name = "discord-quest-completer"\r?\nversion = ")([^"]+)(")/m;

function parts(version) {
    if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`Expected a stable major.minor.patch version: ${version}`);
    }
    return version.split('.').map(BigInt);
}

export function compareVersions(left, right) {
    const a = parts(left), b = parts(right);
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    }
    return 0;
}

function metadata(root) {
    const read = name => fs.readFileSync(path.join(root, name), 'utf8');
    const version = JSON.parse(read('package.json')).version;
    parts(version);
    const cargo = read('src-tauri/Cargo.toml');
    const lock = read('src-tauri/Cargo.lock');
    const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
    if (!cargoVersion.test(cargo) || !lockedVersion.test(lock)) throw new Error('Missing Cargo application version');
    return { version, cargo, lock, tauri };
}

export function checkVersion(root = projectRoot) {
    const { version, cargo, lock, tauri } = metadata(root);
    if (tauri.version !== '../package.json' || cargo.match(cargoVersion)[2] !== version
        || lock.match(lockedVersion)[2] !== version) {
        throw new Error('Application versions disagree. Update package.json, then run pnpm version:sync.');
    }
    return version;
}

export function syncVersion(root = projectRoot) {
    const { version, cargo, lock, tauri } = metadata(root);
    const previous = [cargo.match(cargoVersion)[2], lock.match(lockedVersion)[2]];
    if (tauri.version !== '../package.json') previous.push(tauri.version);
    if (previous.some(old => compareVersions(version, old) < 0)) {
        throw new Error('Application version must not decrease.');
    }
    const write = (name, value) => fs.writeFileSync(path.join(root, name), value);
    write('src-tauri/Cargo.toml', cargo.replace(cargoVersion, (_, prefix, old, suffix) => `${prefix}${version}${suffix}`));
    write('src-tauri/Cargo.lock', lock.replace(lockedVersion, (_, prefix, old, suffix) => `${prefix}${version}${suffix}`));
    tauri.version = '../package.json';
    write('src-tauri/tauri.conf.json', `${JSON.stringify(tauri, null, 2)}\n`);
    return checkVersion(root);
}

export function checkRelease(root, pages) {
    const version = checkVersion(root);
    if (!Array.isArray(pages)) throw new Error('Expected GitHub release data');
    for (const release of pages.flat()) {
        if (!release || typeof release.tag_name !== 'string') throw new Error('Invalid GitHub release record');
        if (release.prerelease) continue;
        const previous = release.tag_name === 'V.1.0' ? '1.0.0' : release.tag_name.replace(/^v/, '');
        if (compareVersions(version, previous) <= 0) {
            throw new Error(`Release ${version} must be newer than existing release ${release.tag_name}.`);
        }
    }
    return version;
}

export function artifactVersion(root, file) {
    const version = checkVersion(root);
    if (fs.readFileSync(file, 'utf8').trim() !== version) throw new Error('Artifact version does not match package.json');
    return version;
}

export function updaterManifest(version, repository, signature, date = new Date().toISOString()) {
    parts(version);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid GitHub repository');
    if (!signature?.trim()) throw new Error('Missing updater signature');
    return {
        version, notes: 'See the release page for details.', pub_date: new Date(date).toISOString(),
        platforms: { 'windows-x86_64': {
            signature: signature.trim(),
            url: `https://github.com/${repository}/releases/download/${version}/discord-quest-completer-setup.exe`,
        } },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const [command = 'check', ...args] = process.argv.slice(2);
        if (command === 'check') console.log(checkVersion());
        else if (command === 'sync') console.log(syncVersion());
        else if (command === 'release') console.log(checkRelease(projectRoot, JSON.parse(fs.readFileSync(args[0], 'utf8'))));
        else if (command === 'artifact') console.log(artifactVersion(projectRoot, args[0]));
        else if (command === 'manifest') {
            const manifest = updaterManifest(artifactVersion(projectRoot, args[0]), process.env.GITHUB_REPOSITORY,
                fs.readFileSync(args[1], 'utf8'));
            fs.writeFileSync(args[2], `${JSON.stringify(manifest, null, 2)}\n`);
        } else throw new Error(`Unknown version command: ${command}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
