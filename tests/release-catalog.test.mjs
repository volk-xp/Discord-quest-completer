import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/validate-catalog.mjs', import.meta.url));
const game = JSON.parse(fs.readFileSync(new URL('./fixtures/game-catalog.json', import.meta.url), 'utf8'))[0];

function validate(t, raw) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dqc catalog validation '));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'catalog.json');
    fs.writeFileSync(file, raw);
    return spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
}

test('release validation accepts a catalog using the application schema', t => {
    const result = validate(t, JSON.stringify([game]));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Validated 1 game records/);
});

for (const [name, raw] of [
    ['empty response', ''],
    ['empty catalog', '[]'],
    ['malformed JSON', '{'],
    ['non-array catalog', '{}'],
    ['invalid later record', JSON.stringify([game, { ...game, id: 'bad' }])],
    ['invalid executable', JSON.stringify([{ ...game, executables: [null] }])],
    ['invalid metadata', JSON.stringify([{ ...game, aliases: [42] }])],
]) {
    test(`release validation rejects ${name}`, t => {
        const result = validate(t, raw);
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /SyntaxError|Game catalog (?:is empty|must be an array)|Invalid .*catalog/);
    });
}
