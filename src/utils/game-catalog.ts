import type { Game, GameExecutable } from '../types/types';

const RESERVED_NAME = /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

export function isValidAppId(value: unknown): value is string {
    return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value)
        && BigInt(value) <= 18446744073709551615n;
}

// Apply Windows rules on every host, including browser previews and tests.
export function executableParts(value: unknown): string[] | null {
    if (typeof value !== 'string' || value.length > 4096) return null;
    const parts = value.split(/[\\/]/);
    if (parts.some(part => !part || part === '.' || part === '..' || part.length > 255
        || /[\x00-\x1f\x7f<>:"|?*]/.test(part) || /[. ]$/.test(part)
        || RESERVED_NAME.test(part.split('.')[0].trimEnd()))) return null;
    return /\.exe$/i.test(parts[parts.length - 1]) ? parts : null;
}

// Construct a fresh object: catalog-supplied path/filename/runtime flags never win.
export function launchExecutable(executable: GameExecutable): GameExecutable | null {
    const parts = executableParts(executable.name);
    if (executable.os !== 'win32' || !parts) return null;
    return {
        name: executable.name,
        os: executable.os,
        is_launcher: executable.is_launcher === true,
        path: parts.slice(0, -1).join('\\'),
        filename: parts[parts.length - 1],
        segments: parts.length,
    };
}

export function gamePathPayload(appId: string, executable: GameExecutable) {
    if (!isValidAppId(appId) || !launchExecutable(executable)) {
        throw new Error('Invalid game ID or Windows executable path.');
    }
    // Rust derives the directory and filename from this one validated name.
    return { app_id: appId, executable_name: executable.name };
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
        throw new Error('Invalid string array in game catalog.');
    }
    return [...value];
}

export function parseGameCatalog(value: unknown, preserveLocalUid = false): Game[] {
    if (!Array.isArray(value)) throw new Error('Game catalog must be an array.');
    return value.map(entry => {
        if (!record(entry) || !isValidAppId(entry.id) || typeof entry.name !== 'string'
            || !entry.name.trim() || !Array.isArray(entry.executables)) {
            throw new Error('Invalid game record in catalog.');
        }
        const executables: GameExecutable[] = [];
        for (const executable of entry.executables) {
            if (!record(executable) || typeof executable.name !== 'string'
                || typeof executable.os !== 'string'
                || (executable.is_launcher !== undefined && typeof executable.is_launcher !== 'boolean')) {
                throw new Error('Invalid executable record in catalog.');
            }
            if (!['win32', 'linux', 'darwin'].includes(executable.os)) continue;
            // Some catalog entries contain unsupported wildcard patterns. Omit
            // these entries rather than making the entire catalog unusable.
            if (executable.os === 'win32' && !executableParts(executable.name)) continue;
            executables.push({ name: executable.name, os: executable.os,
                is_launcher: executable.is_launcher === true });
        }
        const game: Game = {
            id: entry.id, name: entry.name, executables,
            aliases: strings(entry.aliases), themes: strings(entry.themes),
        };
        if (preserveLocalUid && typeof entry.uid === 'string'
            && entry.uid.length > 0 && entry.uid.length <= 128 && !entry.uid.includes('\0')) {
            game.uid = entry.uid;
        }
        return game;
    });
}
