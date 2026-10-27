import { Game } from '@/types/types';
import { fetch, ClientOptions } from '@tauri-apps/plugin-http';
import { tryOnMounted, tryOnScopeDispose, useAsyncState } from '@vueuse/core';
import { ref, watch } from 'vue';
import { message } from '@tauri-apps/plugin-dialog'; 
import { invokeRequest } from '@/utils/invoke-request';
import { useGlobalState } from './app-state';
import { parseGameCatalog } from '@/utils/game-catalog';

const GAME_CATALOG_KEY = 'dqc:game-catalog';

export function useFetchGameList() {
    const { addLog } = useGlobalState();
    function parseUsableGameList(value: unknown): Game[] {
        const games = parseGameCatalog(value);
        if (games.length === 0) throw new Error('Game catalog is empty.');
        return games;
    }
    function loadCachedGameList(): Game[] {
        try {
            const raw = localStorage.getItem(GAME_CATALOG_KEY);
            return raw ? parseUsableGameList(JSON.parse(raw)) : [];
        } catch {
            addLog('warning', 'Cached game list is unavailable or invalid.');
            return [];
        }
    }
    function cacheGameList(games: Game[]) {
        try {
            localStorage.setItem(GAME_CATALOG_KEY, JSON.stringify(games));
        } catch {
            addLog('warning', 'Unable to persist game list; keeping it in memory.');
        }
    }
    let activeFetch: AbortController | null = null;
    let pendingFetch: Promise<void> = Promise.resolve();
    let runningSignal: AbortSignal | undefined;
    async function fetchRemoteGameList(command: string): Promise<Game[]> {
        const signal = runningSignal;
        const response = await invokeRequest(command, {}, signal);
        if (signal?.aborted) throw { code: 'cancelled', message: 'Request cancelled' };
        const games = parseUsableGameList(response);
        cacheGameList(games);
        return games;
    }
    async function fetchGameListGHMirror() {
        addLog('Fetching game list from GitHub mirror...'); 
        return fetchRemoteGameList('fetch_gamelist_gh_mirror');
    }
    async function fetchGameListFromDiscord (){
        addLog('Fetching game list directly from discord...'); 
        return fetchRemoteGameList('fetch_gamelist_from_discord');
    };

    // const fetchBundledGameList = fetch(window.location.origin+'/gamelist.json', { method: 'GET' });

    const { 
        state: gameListGHMirror,
        error: errorGH,
        isReady: isReadyGH,
        execute: executeGH,
        isLoading: isLoadingGH
    } = useAsyncState<Game[]>(fetchGameListGHMirror, [], {
            immediate: false,
            resetOnExecute: true,
        });
    const { 
        state: gameListFromDiscord, 
        error: errorDiscord,
        isReady: isReadyDiscord,
        execute: executeDiscord,
        isLoading: isLoadingDiscord
    } = useAsyncState(fetchGameListFromDiscord, [], {
        immediate: false,
        resetOnExecute: true,
    });
    const { 
        state: bundledGameList,
        error: errorBundled,
        isReady: isReadyBundled,
        execute: executeBundled,
        isLoading: isLoadingBundled
    } = useAsyncState(() => {
        const result = import('../assets/gamelist.json').then(res => parseUsableGameList(res.default));
        addLog('Fetching bundled game list for fallback...');
        return result;
    }, [], {
        immediate: false,
        resetOnExecute: true,
    });

    const fetchError = ref<string | null>(null);
    const fetchOutcome = ref<'fresh' | 'cached' | 'bundled' | 'failed' | null>(null);

    const gameDB = ref<Game[]>(loadCachedGameList());

    const allFetchDone = ref(false);

    watch(() => isReadyGH.value, async (newVal) => {
        addLog('debug','isReadyGH: ' + newVal); 
    });

    watch(() => isReadyDiscord.value, async (newVal) => {
        addLog('debug','isReadyDiscord: ' + newVal);
    })
    
    watch(() => isReadyBundled.value, async (newVal) => {
        addLog('debug','isReadyBundled: ' + newVal); 
    });

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    function cancelFetchGameList() {
        activeFetch?.abort();
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    }
    function fetchGameList(): Promise<void> {
        cancelFetchGameList();
        const controller = new AbortController();
        activeFetch = controller;
        // Let the cancelled useAsyncState executions settle before resetting
        // their refs for the next refresh.
        const next = pendingFetch.catch(() => {}).then(async () => {
            if (!controller.signal.aborted) await refreshGameList(controller.signal);
        });
        pendingFetch = next;
        return next.finally(() => { if (activeFetch === controller) activeFetch = null; });
    }
    async function refreshGameList(signal: AbortSignal) {
        runningSignal = signal;
        fetchError.value = null;
        fetchOutcome.value = null;
        allFetchDone.value = false;
        addLog('Fetching game list...');
        // Prefer remote sources, then the last good catalog, then the bundle.
        try {
           await Promise.all([executeGH(), executeBundled()]);
        } catch {
            addLog('error', 'Error executing fetch for GitHub mirror or bundled game list.');
        }

        if (signal.aborted) return;
        if (errorGH.value) { 
            addLog('error','Error fetching game list from GitHub mirror');
            await executeDiscord();
            if (signal.aborted) return;
            if (errorDiscord.value) {
                addLog('error','Error fetching game list from Discord:');
            }
        }
        // silently log error for bundled, as it's the last resort.
        if (errorBundled.value) {
            addLog('error','Error fetching bundled game list');
        }

        if (signal.aborted) return;
        if (gameListGHMirror.value.length > 0) {
            gameDB.value = gameListGHMirror.value;
            fetchOutcome.value = 'fresh';
            addLog('Using game list from GitHub mirror. ' + gameListGHMirror.value.length + ' entries.');
        } else if (gameListFromDiscord.value.length > 0) {
            gameDB.value = gameListFromDiscord.value;
            fetchOutcome.value = 'fresh';
            addLog('Using game list from Discord. ' + gameListFromDiscord.value.length + ' entries.');
        } else if (gameDB.value.length > 0) {
            fetchOutcome.value = 'cached';
            addLog('Using last-known-good game list. ' + gameDB.value.length + ' entries.');
        } else if (bundledGameList.value.length > 0) {
            addLog('Using bundled game list as fallback. ' + bundledGameList.value.length + ' entries.');
            gameDB.value = bundledGameList.value;
            fetchOutcome.value = 'bundled';
            cacheGameList(bundledGameList.value);
        } else {
            fetchOutcome.value = 'failed';
            fetchError.value = 'No usable game list is available';
            await message(fetchError.value, {
                title: 'Game List Fetch Error',
                kind: 'error',
                buttons: { ok: 'OK' },
            });
        }

        if (signal.aborted) return;
        // Set a timeout to delay setting allFetchDone to true, to allow UI to update.
      
        timeoutId = setTimeout(() => {
            if (!signal.aborted) allFetchDone.value = true;
        }, 1800);

    }

    watch(allFetchDone, (newVal) => {
        if (newVal && timeoutId) {
            clearTimeout(timeoutId);
        }
    });

    tryOnScopeDispose(cancelFetchGameList);

    tryOnMounted(async () => {
        await fetchGameList();
    });


    return {
        gameListGHMirror,
        gameListFromDiscord,
        bundledGameList,
        fetchError,
        fetchOutcome,
        isReadyGH,
        isReadyDiscord,
        isReadyBundled,
        gameDB,
        fetchGameList,
        cancelFetchGameList,
        isLoadingGH,
        isLoadingDiscord,
        isLoadingBundled,
        allFetchDone
    }
}
