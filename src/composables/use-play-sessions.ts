import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Game, GameExecutable } from '@/types/types';
import { gamePathPayload } from '@/utils/game-catalog';
import { useGameList } from './use-game-list';
import { useGlobalState } from './app-state';
import { useHistory } from './use-history';
import { useToasts } from './use-toasts';
import { useUserPrefs } from './user-prefs';

// A local helper lifetime, independent of quest requirements or progress.
// Native ownership enforces this deadline even without a live renderer.
export const AUTO_STOP_MS = 16 * 60 * 1000;

export interface PlaySession {
    key: string;
    gameId: string;
    gameName: string;
    executableName: string;
    launchId: string;
    startedAt: number;
    endsAt: number;
}

interface NativeSession {
    launch_id: string;
    started_at: number;
    ends_at: number;
}

export function playSessionKey(gameId: string | undefined, executableName: string) {
    return `${gameId ?? '-'}\u0000${executableName.replace(/\\/g, '/').toLowerCase()}`;
}

const sessions = ref<PlaySession[]>([]);
const currentlyPlaying = ref<string | null>(null);
const stoppingLaunches = new Set<string>();
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
let checkingProcesses = false;
const { gameList } = useGameList();
const { addLog } = useGlobalState();
const { addHistoryEntry } = useHistory();
const { pushToast } = useToasts();
const { notificationsEnabled } = useUserPrefs();

function notify(type: 'success' | 'error' | 'info', message: string) {
    if (notificationsEnabled.value) pushToast(type, message);
}

function updateRunningState(session: PlaySession, running: boolean) {
    for (const game of gameList.value) {
        if (game.id !== session.gameId) continue;
        let matched = false;
        for (const executable of game.executables) {
            if (playSessionKey(game.id, executable.name) !== session.key) continue;
            executable.is_running = running;
            matched = true;
        }
        if (matched) game.is_running = game.executables.some(executable => executable.is_running);
    }
    if (!running && currentlyPlaying.value === session.gameId
        && !sessions.value.some(item => item.gameId === session.gameId)
        && !gameList.value.some(game => game.id === session.gameId && game.is_running)) {
        currentlyPlaying.value = null;
    }
}

function finishSession(session: PlaySession, manual = false) {
    if (!sessions.value.some(item => item.key === session.key && item.launchId === session.launchId)) return;
    sessions.value = sessions.value.filter(item => item.key !== session.key);
    updateRunningState(session, false);
    if (sessions.value.length === 0 && ticker) {
        clearInterval(ticker);
        ticker = null;
    }
    addLog('info', `Helper closed: ${session.gameName} (${session.executableName})`);
    addHistoryEntry(session.gameName, 'stopped');
    notify('info', manual ? `Stopped ${session.gameName}`
        : `Helper closed for ${session.gameName}. Check quest progress in Discord.`);
}

async function syncExitedProcesses() {
    if (checkingProcesses || sessions.value.length === 0) return;
    checkingProcesses = true;
    const checked = [...sessions.value];
    try {
        const running = new Map((await invoke<NativeSession[]>('running_processes'))
            .map(session => [session.launch_id, session]));
        for (const session of checked) {
            const current = sessions.value.find(item => item.key === session.key);
            if (current?.launchId !== session.launchId || stoppingLaunches.has(session.launchId)) continue;
            const native = running.get(session.launchId);
            if (!native) finishSession(session);
            else {
                current.startedAt = native.started_at;
                current.endsAt = native.ends_at;
                updateRunningState(current, true);
            }
        }
    } catch (error) {
        addLog('error', `Failed to check helper processes: ${String(error)}`);
    } finally {
        checkingProcesses = false;
    }
}

function startTicker() {
    if (ticker) return;
    // Display and reconciliation only; native code owns all stop deadlines.
    ticker = setInterval(() => {
        now.value = Date.now();
        void syncExitedProcesses();
    }, 1000);
}

async function startPlaySession({ game, executable }: { game: Game; executable: GameExecutable }): Promise<PlaySession> {
    const key = playSessionKey(game.id, executable.name);
    const launchId = await invoke<string>('run_background_process', {
        name: game.name, ...gamePathPayload(game.id, executable),
    });
    const previous = sessions.value.find(session => session.key === key && session.launchId === launchId);
    if (previous) {
        updateRunningState(previous, true);
        return previous;
    }
    const startedAt = Date.now();
    const session: PlaySession = {
        key, gameId: game.id, gameName: game.name, executableName: executable.name,
        launchId, startedAt, endsAt: startedAt + AUTO_STOP_MS,
    };
    sessions.value = [...sessions.value.filter(item => item.key !== key), session];
    updateRunningState(session, true);
    currentlyPlaying.value = game.id;
    now.value = startedAt;
    startTicker();
    void syncExitedProcesses();
    addHistoryEntry(game.name, 'launched');
    notify('success', `Launched ${game.name}`);
    return session;
}

async function stopPlaySession(game: Game, executable: GameExecutable, expectedLaunchId?: string): Promise<boolean> {
    const session = sessions.value.find(item => item.key === playSessionKey(game.id, executable.name));
    if (!session || (expectedLaunchId !== undefined && session.launchId !== expectedLaunchId)
        || stoppingLaunches.has(session.launchId)) return false;
    stoppingLaunches.add(session.launchId);
    try {
        await invoke('stop_process', { launch_id: session.launchId });
        if (!sessions.value.some(item => item.key === session.key && item.launchId === session.launchId)) return false;
        finishSession(session, true);
        return true;
    } catch (error) {
        addLog('error', `Failed to stop ${game.name}: ${String(error)}`);
        notify('error', `Failed to stop ${game.name}`);
        return false;
    } finally {
        stoppingLaunches.delete(session.launchId);
    }
}

function getPlaySession(gameId: string | undefined, executableName: string) {
    return sessions.value.find(session => session.key === playSessionKey(gameId, executableName));
}

function remainingMs(session: PlaySession | null | undefined) {
    return session ? Math.max(0, session.endsAt - now.value) : 0;
}

function formatCountdown(ms: number) {
    const seconds = Math.ceil(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const nextExpiringSession = computed<PlaySession | null>(() =>
    [...sessions.value].sort((a, b) => a.endsAt - b.endsAt)[0] ?? null);
const hasPlaySession = computed(() => sessions.value.length > 0);

export function usePlaySessions() {
    return {
        playSessions: computed(() => sessions.value), currentlyPlaying, hasPlaySession, nextExpiringSession,
        startPlaySession, stopPlaySession, getPlaySession, remainingMs, formatCountdown, AUTO_STOP_MS,
    };
}
