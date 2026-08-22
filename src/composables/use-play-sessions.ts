import { computed, ref } from 'vue';

/**
 * A "play session" tracks one launched platform executable. It exists because
 * the two ways of telling Discord you are playing have opposite lifetimes:
 *
 *   Test RPC   -> open-ended. Rich Presence is pushed until the user hits
 *                 disconnect, so its clock counts up forever.
 *   Executable -> fixed window. Discord credits a quest after 15 minutes of
 *                 detected playtime, so there is no reason to leave the dummy
 *                 process running afterwards. We hold it for 16 minutes — a
 *                 full minute of margin over Discord's threshold to absorb
 *                 polling jitter — then close the window ourselves.
 *
 * Module-level singleton, matching the other composables in this folder, so the
 * countdown is readable from both HomeView (the big clock) and GameExecutables
 * (the per-row badge) without prop drilling or a new injection key.
 */
export const AUTO_STOP_MS = 16 * 60 * 1000;

export interface PlaySession {
    key: string;
    gameUid: string | undefined;
    gameName: string;
    executableName: string;
    startedAt: number;
    endsAt: number;
}

/**
 * Identity of a session. Keyed per executable, not per game, because a game can
 * have several platform executables running at once and each gets its own
 * independent window. NUL separates the parts so no executable path can forge a
 * collision. `uid` is optional on the Game type; the fallback keeps the writer
 * (HomeView) and the reader (GameExecutables) deriving the same key.
 */
export function playSessionKey(gameUid: string | undefined, executableName: string) {
    return `${gameUid ?? '-'}\u0000${executableName}`;
}

const sessions = ref<PlaySession[]>([]);

// Expiry callbacks are behaviour, not display state, so they live outside the
// ref — Vue should not be walking functions with deep reactivity.
const expiryHandlers = new Map<string, () => void>();

// A single shared 1s tick drives every countdown rather than one interval per
// session. Reading `now` is what makes remaining time reactive in templates.
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

function stopTicker() {
    if (ticker) {
        clearInterval(ticker);
        ticker = null;
    }
}

function sweep() {
    now.value = Date.now();
    const expired = sessions.value.filter(s => s.endsAt <= now.value);
    for (const session of expired) {
        // Drop the session *before* firing its handler. The handler runs the
        // normal stop path, which calls endPlaySession() itself, and this makes
        // that call a harmless no-op instead of a double fire.
        sessions.value = sessions.value.filter(s => s.key !== session.key);
        const handler = expiryHandlers.get(session.key);
        expiryHandlers.delete(session.key);
        handler?.();
    }
    if (sessions.value.length === 0) {
        stopTicker();
    }
}

function startTicker() {
    if (ticker) return;
    now.value = Date.now();
    ticker = setInterval(sweep, 1000);
}

/**
 * Begin the auto-stop window for a launched executable. `onExpire` is invoked
 * once when the window closes; keeping it a callback leaves all Tauri calls and
 * user-facing messaging in HomeView where the rest of that logic lives.
 */
function startPlaySession(opts: {
    gameUid: string | undefined;
    gameName: string;
    executableName: string;
    onExpire: () => void;
}): PlaySession {
    const key = playSessionKey(opts.gameUid, opts.executableName);
    const startedAt = Date.now();
    const session: PlaySession = {
        key,
        gameUid: opts.gameUid,
        gameName: opts.gameName,
        executableName: opts.executableName,
        startedAt,
        endsAt: startedAt + AUTO_STOP_MS,
    };
    // Relaunching the same executable restarts its window instead of stacking a
    // second one that would fire against an already-closed process.
    sessions.value = [...sessions.value.filter(s => s.key !== key), session];
    expiryHandlers.set(key, opts.onExpire);
    startTicker();
    return session;
}

/**
 * Cancel a pending auto-stop. Called when the user stops an executable by hand,
 * so the timer cannot fire later against something already closed.
 */
function endPlaySession(gameUid: string | undefined, executableName: string) {
    const key = playSessionKey(gameUid, executableName);
    sessions.value = sessions.value.filter(s => s.key !== key);
    expiryHandlers.delete(key);
    if (sessions.value.length === 0) {
        stopTicker();
    }
}

function clearPlaySessions() {
    sessions.value = [];
    expiryHandlers.clear();
    stopTicker();
}

function getPlaySession(gameUid: string | undefined, executableName: string) {
    const key = playSessionKey(gameUid, executableName);
    return sessions.value.find(s => s.key === key);
}

/** Milliseconds left, clamped at zero. Reads `now`, so callers stay reactive. */
function remainingMs(session: PlaySession | null | undefined) {
    if (!session) return 0;
    return Math.max(0, session.endsAt - now.value);
}

/** mm:ss — the window is always under an hour, so an hours field is dead weight. */
function formatCountdown(ms: number) {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// The big clock has room for one number, so show whichever session expires
// first — that is the next thing that will actually happen.
const nextExpiringSession = computed<PlaySession | null>(() => {
    if (sessions.value.length === 0) return null;
    return [...sessions.value].sort((a, b) => a.endsAt - b.endsAt)[0];
});

const hasPlaySession = computed(() => sessions.value.length > 0);

export function usePlaySessions() {
    return {
        playSessions: sessions,
        hasPlaySession,
        nextExpiringSession,
        startPlaySession,
        endPlaySession,
        clearPlaySessions,
        getPlaySession,
        remainingMs,
        formatCountdown,
        AUTO_STOP_MS,
    };
}
