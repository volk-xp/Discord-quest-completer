import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchesGlob } from 'node:path/posix';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../.github/workflows/rust-check.yml', import.meta.url), 'utf8');
const pullRequest = workflow.match(/^  pull_request:\r?\n([\s\S]*?)(?=^  \w)/m)?.[1];
assert.ok(pullRequest, 'Checks workflow must handle pull requests');
const paths = pullRequest.match(/^    paths:\r?\n((?:      - .*\r?\n)+)/m)?.[1];
assert.ok(paths, 'Expected a block list of pull request paths');
const patterns = [...paths.matchAll(/^      - ['"]([^'"]+)['"]\r?$/gm)].map(match => match[1]);
assert.ok(patterns.length, 'Expected quoted path patterns');

function triggers(files) {
    return files.some(file => patterns.some(pattern => matchesGlob(file, pattern)));
}

for (const [category, files] of [
    ['frontend', ['src/pages/HomeView.vue', 'src/composables/use-favorites.ts',
        'src/assets/gamelist.json', 'src/styles.css', 'public/logo.svg', 'index.html',
        'vite.config.ts', 'tsconfig.json', 'tsconfig.node.json']],
    ['dependencies and lockfiles', ['package.json', 'pnpm-lock.yaml',
        'src-tauri/Cargo.lock', 'src-win/Cargo.lock']],
    ['workflows and regression tests', ['.github/workflows/rust-check.yml',
        '.github/workflows/build-release.yaml', '.github/workflows/new-check.yml',
        'tests/ci-triggers.test.mjs', 'scripts/prepare-runner.mjs']],
    ['existing Rust and Tauri coverage', ['src-tauri/src/lib.rs', 'src-win/src/main.rs',
        'src-tauri/Cargo.toml', 'src-win/Cargo.toml', 'src-tauri/tauri.conf.json',
        'src-tauri/tauri.check.conf.json']],
]) {
    test(`${category} changes trigger PR checks independently`, () => {
        for (const file of files) assert.equal(triggers([file]), true, `${file} alone must trigger checks`);
    });
}

test('documentation-only PRs remain excluded while mixed PRs trigger checks', () => {
    assert.equal(triggers(['README.md', 'docs/process-ownership.md']), false);
    assert.equal(triggers(['README.md', 'src/pages/HomeView.vue']), true);
});
