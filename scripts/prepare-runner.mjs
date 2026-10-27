import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const target = 'x86_64-pc-windows-msvc';

export function prepareRunner(root = projectRoot, run = spawnSync) {
    const targetDir = path.join(root, 'src-win', 'target');
    const result = run('cargo', [
        'build', '--release', '--locked',
        '--manifest-path', path.join(root, 'src-win', 'Cargo.toml'),
        '--target', target, '--target-dir', targetDir,
    ], { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Windows helper build failed (${result.status ?? result.signal}).`);
    const resources = path.join(root, 'src-tauri', 'resources');
    mkdirSync(resources, { recursive: true });
    copyFileSync(path.join(targetDir, target, 'release', 'src-win.exe'), path.join(resources, 'src-win.exe'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        prepareRunner();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
