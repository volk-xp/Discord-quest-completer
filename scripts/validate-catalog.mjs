import { readFileSync } from 'node:fs';
import { parseGameCatalog } from '../src/utils/game-catalog.ts';

const file = process.argv[2] ?? new URL('../src/assets/gamelist.json', import.meta.url);
const games = parseGameCatalog(JSON.parse(readFileSync(file, 'utf8')));
if (games.length === 0) throw new Error('Game catalog is empty.');
console.log(`Validated ${games.length} game records.`);
