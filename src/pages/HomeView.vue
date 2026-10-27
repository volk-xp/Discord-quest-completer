<script setup lang="ts">
import { ref, computed, useTemplateRef, shallowRef, provide, nextTick, triggerRef, onUnmounted, onMounted, watch } from 'vue';
// import gameListData from '../assets/gamelist.json';
import { onClickOutside, refDebounced, tryOnMounted } from '@vueuse/core';
import { useFuse } from '@vueuse/integrations/useFuse'
import { invoke } from '@tauri-apps/api/core';
import { randomString } from '@/utils/random-string';
import { GameActionsProvider, GameExecutable, type Game } from '@/types/types';
import IconVerified from '@/components/IconVerified.vue';
import { isEmpty } from 'lodash-es';
import GameExecutables from '@/components/GameExecutables.vue';
import { GameActionsKey, EXECUTABLE_OS } from '@/constants/constants';
import { executableParts, gamePathPayload, launchExecutable } from '@/utils/game-catalog';
import { useFetchGameList } from '@/composables/fetch-gamelist';
import { UseFuseOptions } from '@vueuse/integrations';
import Fuse from 'fuse.js';
import { Pages, useGlobalState } from '@/composables/app-state';
import TimedNotification from '@/components/TimedNotification.vue';
import UndoToast from '@/components/UndoToast.vue';
import { useUserPrefs } from '@/composables/user-prefs';
import { useFavorites } from '@/composables/use-favorites';
import { useToasts } from '@/composables/use-toasts';
import { useHistory } from '@/composables/use-history';
import { useGameList } from '@/composables/use-game-list';
import { useRpcState } from '@/composables/use-rpc-state';
import { usePlaySessions } from '@/composables/use-play-sessions';


type DialogKey = 
    'none' | 
    'rpc_message_1'|
    'no_game_selected';;

// Game list from JSON file
// const gameDB = ref<Game[]>([]);

const {
    gameDB,
    isLoadingBundled,
    isLoadingDiscord,
    isLoadingGH,
    fetchGameList,
    isReadyGH,
    isReadyBundled,
    isReadyDiscord,
    allFetchDone,
    fetchOutcome,
} = useFetchGameList()
const { addLog, setPage } = useGlobalState();
const shouldShowNotificationContainer = computed(() => {
    return isLoadingGH.value || isLoadingDiscord.value || isLoadingBundled.value ||
           (isReadyGH.value || isReadyDiscord.value || isReadyBundled.value);
});

const dialogRef = useTemplateRef<HTMLDialogElement>('dialogRef');
const searchResultContainerRef = useTemplateRef<HTMLElement>('searchResultContainerRef')
const dialogMessage = ref('');
const isDialogOpen = ref(false);
const dialogKey = ref<DialogKey>('none')
const { isConnectedToRPC, isConnecting, isDisconnecting, rpcError, sessionElapsed, connectRpc, disconnectRpc } = useRpcState();
// Launched executables are time-boxed; Test RPC is not. See use-play-sessions.ts.
const {
    playSessions,
    hasPlaySession,
    nextExpiringSession,
    currentlyPlaying,
    startPlaySession,
    stopPlaySession,
    getPlaySession,
    remainingMs,
    formatCountdown,
    AUTO_STOP_MS,
} = usePlaySessions();
const { density, toggleDensity, notificationsEnabled } = useUserPrefs();
const { isFavorite, toggleFavorite: toggleFavoriteGame } = useFavorites();
const { pushToast } = useToasts();
const { addHistoryEntry } = useHistory();
const searchInputRef = useTemplateRef<HTMLInputElement>('searchInputRef');

function notify(type: 'success' | 'error' | 'info', message: string) {
    if (notificationsEnabled.value) {
        pushToast(type, message);
    }
}
const undoToastRef = useTemplateRef<InstanceType<typeof UndoToast>>('undoToastRef');
const rpcConnectedAt = ref<number | null>(null);
let sessionTimerInterval: ReturnType<typeof setInterval> | null = null;

function formatElapsed(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function startSessionTimer() {
    rpcConnectedAt.value = Date.now();
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    sessionTimerInterval = setInterval(() => {
        if (rpcConnectedAt.value) {
            sessionElapsed.value = formatElapsed(Date.now() - rpcConnectedAt.value);
        }
    }, 1000);
}

function stopSessionTimer() {
    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
        sessionTimerInterval = null;
    }
    rpcConnectedAt.value = null;
    sessionElapsed.value = '00:00:00';
}

// Games are ordered directly in gameList.value. Favoriting regroups them;
// the up/down arrow buttons let the user manually reorder within that.
function handleToggleFavorite(game: Game) {
    if (!game?.id) return;
    toggleFavoriteGame(game);
    // Regroup: favorites first (preserving their relative order), then the rest
    const favs = gameList.value.filter(g => isFavorite(g.id));
    const rest = gameList.value.filter(g => !isFavorite(g.id));
    gameList.value = [...favs, ...rest];
}

function moveGameUp(index: number) {
    if (index <= 0) return;
    const updated = [...gameList.value];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    gameList.value = updated;
}

function moveGameDown(index: number) {
    if (index >= gameList.value.length - 1) return;
    const updated = [...gameList.value];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    gameList.value = updated;
}

// Search functionality
const searchQuery = shallowRef('');
const debouncedSearchQuery = refDebounced(searchQuery, 300)

const searchResultsIsOpen = ref(false);
const isOnSearchResults = ref(false);

onClickOutside(searchResultContainerRef, () => {
    searchResultsIsOpen.value = false;
})

// const searchResults = computed(() => {
//     if (!debouncedSearchQuery.value) return [];
//     const query = debouncedSearchQuery.value.toLowerCase();
//     return gameDB.value.filter(game =>
//         game.name.toLowerCase().includes(query) ||
//         game.aliases?.some(alias => alias.toLowerCase().includes(query))
//     );
// });

const COPYRIGHT_SYMBOL = '\u00A9';
const TRADEMARK_SYMBOL = '\u2122';
const REGISTERED_SYMBOL = '\u00AE';
const ignoredSymbols = [COPYRIGHT_SYMBOL, TRADEMARK_SYMBOL, REGISTERED_SYMBOL];
const ignoredSymbolsRegex = new RegExp(`[${ignoredSymbols.join('')}]`, 'g');
const fuseOptions = computed<UseFuseOptions<Game>>(() => ({
    fuseOptions: {
        // Prioritize name and aliases for searching, then lastly executables
        keys: [
            { name: 'name', weight: 0.7 },
            { name: 'aliases', weight: 0.2 },
            { name: 'executables.name', weight: 0.1 },
        ],
        getFn: (obj: any, path: string[] | string) => {
            const value = Fuse.config.getFn(obj, path);
            return typeof value === "string"
            ? value.replace(ignoredSymbolsRegex, "")
            : value;
        },
        isCaseSensitive: false,
        threshold: 0.5,        
        // A score of 0indicates a perfect match, while a score of 1 indicates a complete mismatch
        includeScore: true,
        includeMatches: false
    },
    resultLimit: 12,
    matchAllWhenSearchEmpty: false,
}));

const { results: searchResults } = useFuse(debouncedSearchQuery, gameDB, fuseOptions)

let hasNotifiedFetchDone = false;
watch(allFetchDone, (done) => {
    if (done && !hasNotifiedFetchDone) {
        hasNotifiedFetchDone = true;
        if (fetchOutcome.value === 'fresh') notify('success', 'Game list refreshed');
        else if (fetchOutcome.value === 'cached') notify('info', 'Using cached game list');
        else if (fetchOutcome.value === 'bundled') notify('info', 'Using bundled game list');
        else if (fetchOutcome.value === 'failed') notify('error', 'No usable game list is available');
    } else if (!done) {
        hasNotifiedFetchDone = false;
    }
});

function handleFocusSearchEvent() {
    searchInputRef.value?.focus();
    openSearchResults();
}

function handleSelectFavoriteGame(e: Event) {
    const game = (e as CustomEvent<Game>).detail;
    if (!game?.id) return;
    let found = gameList.value.find(g => g.id === game.id);
    if (!found) {
        // The favorited game isn't currently in Home's session list
        // (e.g. it was removed, or the app was just restarted) — add it
        // back so Play works seamlessly regardless.
        found = createRuntimeGame(game);
        gameList.value = [...gameList.value, found];
    }
    selectGame(found);
    // Prefer directly launching a win32 executable over requiring the user
    // to manually pick one or use Test RPC.
    autoPlayFavorite(found);
}

onMounted(() => {
    window.addEventListener('dqc:focus-search', handleFocusSearchEvent);
    window.addEventListener('dqc:select-game', handleSelectFavoriteGame);
});

onUnmounted(() => {
    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
    }
    // Helper ownership and deadlines belong to the shared session manager.
    window.removeEventListener('dqc:focus-search', handleFocusSearchEvent);
    window.removeEventListener('dqc:select-game', handleSelectFavoriteGame);
});

// Selected games list
const { gameList } = useGameList();
// const selectedGame = ref<Game | null>(null);
const selectedGameId = ref<string | null | undefined>(null);

const selectedGame = computed(() => {
    if (!selectedGameId.value) return null;
    const found = gameList.value.find(g => g.uid === selectedGameId.value);
    console.log('selectedGame computed - selectedGameId:', selectedGameId.value, 'found:', found);
    return found || null;
});

function closeSearchResults() {
    searchResultsIsOpen.value = false;
}
function openSearchResults() {
    searchResultsIsOpen.value = true;
}

function createRuntimeGame(game: Game): Game {
    const executables = game.executables.map(executable => ({
        ...executable,
        is_installed: false,
        is_running: !!getPlaySession(game.id, executable.name),
    }));
    return {
        ...game,
        uid: randomString(),
        executables,
        is_installed: false,
        is_running: executables.some(executable => executable.is_running),
    };
}

// Function to add a game to the selected list
function addGameToList(game: Game) {
    if (!gameList.value.some(g => g.id === game.id)) {
        gameList.value.push(createRuntimeGame(game));
    }

    closeSearchResults();
}

const forceRerenderKey = ref(0); 
// Function to remove a game from the selected list
function removeGameFromList(game: Game) {
    const gameId = game.uid;
    const removedIndex = gameList.value.findIndex(g => g.uid === gameId);
    const removedGame = gameList.value[removedIndex];
    gameList.value = gameList.value.filter(game => game.uid !== gameId);
    if (selectedGame.value?.uid === gameId) { 
        // selectedGame.value = null;
        selectedGameId.value = null;
        forceRerenderKey.value++; 
    }
    if (removedGame) {
        undoToastRef.value?.show(`Removed ${removedGame.name}`, () => {
            gameList.value.splice(removedIndex, 0, removedGame);
        });
    }
}

function selectGame(game: Game) {
    // selectedGame.value = game;
    selectedGameId.value = game?.uid;
    searchResultsIsOpen.value = false;
}

function canCreateDummyGame(game: Game | null) {
    if (!game) {
        return false;
    }
    // we can only create a dummy game if the game is not installed or game is not running
    return !game.is_installed
}

function canPlayGame(game: Game | null) {
    if (!game) {
        return false;
    }
    // we can only play a game if the game is installed and not running
    return (game.is_installed && !game.is_running) ?? false;
}

function isExecutableRunning(executable: GameExecutable) {
    // Check if the executable is running
    return executable.is_running ?? false;
}
function isGameExecutableInstalled(executable: GameExecutable) {
    // Check if the executable is installed
    return executable.is_installed ?? false;
}

function isGameInstalled(game: Game | null) {
    if (!game) {
        return false;
    }
    // we can only play a game if the game is installed and not running
    return game.is_installed ?? false;
}


// Create a dummy game
async function createDummyGame(game: Game | null, executable: GameExecutable) {
    if (!game) {
        return;
    }
    const gameUid = game.uid;
    const gameToInstall = gameList.value.find(g => g.uid === gameUid);
    const executableItem = gameToInstall?.executables.find(exe => exe.name === executable.name);
    if (gameToInstall && executableItem) {
        const payload = gamePathPayload(gameToInstall.id, executable);
        console.log(payload);
        const result = await invoke('create_fake_game', payload)
        console.log('Game created:', result);
        gameToInstall.is_installed = true;
        executableItem.is_installed = true;
        return true;
    }
}


async function installAndPlay({game, executable}: {game: Game, executable: GameExecutable}) {
    if (!game) {
        return;
    }
    try {
        const gameCreated = await createDummyGame(game, executable);
        if (gameCreated) {
            await playGame({game, executable});
        } else {
            throw new Error('Game or executable is no longer available.');
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        addLog('error', `Failed to create game: ${reason}`);
        notify('error', `Failed to prepare ${game.name}: ${reason}`);
    }
}
// Play game function
async function playGame({game, executable}: {game: Game, executable: GameExecutable}) {
    if (!game) return;
    const gameToPlay = gameList.value.find(item => item.uid === game.uid);
    const executableItem = gameToPlay?.executables.find(item => item.name === executable.name);
    if (!gameToPlay || !executableItem) return;
    try {
        await startPlaySession({ game: gameToPlay, executable: executableItem });
    } catch (error) {
        addLog('error', `Failed to launch game: ${String(error)}`);
        notify('error', `Failed to launch ${game.name}`);
    }
}

// Auto-play: used when launching a game from the Favorites tab. If the game
// has a usable win32 executable, launch it directly (installing the dummy
// exe first if needed) instead of requiring the user to manually pick it or
// use Test RPC. Returns true if it found and launched something.
async function autoPlayFavorite(game: Game): Promise<boolean> {
    const win32Exe = game.executables?.find(exe =>
        exe.os === EXECUTABLE_OS.WINDOWS && executableParts(exe.name) !== null
    );
    if (!win32Exe) {
        return false;
    }
    if (win32Exe.is_running) {
        // Already running — nothing to do.
        return true;
    }

    const executable = launchExecutable(win32Exe)!;

    if (!isGameExecutableInstalled(win32Exe)) {
        await installAndPlay({ game, executable });
    } else {
        await playGame({ game, executable });
    }
    return true;
}

// Stop playing
async function stopPlaying({game, executable}: {game: Game, executable: GameExecutable}) {
    if (game) await stopPlaySession(game, executable);
}

function getExecutables(game: Game) {
    return game.executables.map(exe => exe.name)
}

let rpcGame: Game | null = null;

watch(isConnectedToRPC, connected => {
    if (connected) return;
    stopSessionTimer();
    if (rpcGame) {
        rpcGame.is_running = rpcGame.executables.some(exe => exe.is_running);
        if (currentlyPlaying.value === rpcGame.id && !rpcGame.is_running) currentlyPlaying.value = null;
        rpcGame = null;
    }
});

watch(rpcError, error => {
    if (error) {
        addLog('error', `Discord RPC: ${error}`);
        notify('error', `Discord RPC: ${error}`);
    }
});

async function handleTestRPC(game: Game | null) {
    if (isDisconnecting.value) return;
    if (isConnectedToRPC.value || isConnecting.value) {
        const gameName = rpcGame?.name;
        if (await disconnectRpc()) {
            notify('info', 'Disconnected from Discord Rich Presence');
            if (gameName) addHistoryEntry(gameName, 'rpc_disconnected');
        }
        return;
    }
    showDialog(game ? 'rpc_message_1' : 'no_game_selected');
}

async function continueRPCRisk(game: Game | null) {
    if (!game) return;
    const gameToTest = gameList.value.find(g => g.uid === game.uid);
    if (!gameToTest) return;
    hideDialog();
    if (await connectRpc({ app_id: gameToTest.id })) {
        rpcGame = gameToTest;
        gameToTest.is_running = true;
        currentlyPlaying.value = gameToTest.id;
        startSessionTimer();
        notify('success', `Connected to Discord Rich Presence — ${gameToTest.name}`);
        addHistoryEntry(gameToTest.name, 'rpc_connected');
    }
}

function handleSearchBlur() {
    setTimeout(() => {
        if (!isOnSearchResults.value) {
            searchResultsIsOpen.value = false;
        }
    }, 200);
}

function showDialog(message: DialogKey) {
    isDialogOpen.value = true;
    dialogMessage.value = message;
    dialogKey.value = message;
    if(!isEmpty(message)) {
        dialogRef.value?.showModal();
    }
}

function hideDialog() {
    dialogRef.value?.close(); 
    dialogMessage.value = '';
    isDialogOpen.value = false;
}


provide<GameActionsProvider>(GameActionsKey, {
    canPlayGame,
    isGameInstalled,
    isExecutableRunning,
    isGameExecutableInstalled,
});
</script>

<template>
    <!-- Console layout.
         Left: the library (search + tracked games). Right: the session readout —
         what is happening now, what it is pointed at, and what Discord sees.
         The column is fixed height and only the two inner regions scroll, so the
         list header and the session clock never slide away. -->
    <div class="flex h-full min-h-0 font-sans text-ink">

        <!-- Center dialog -->
        <dialog id="dialog" class="dialogStyle inset-0 bg-deck-850/95 backdrop-blur-xl
        border border-line rounded-[10px] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]
        transition-opacity duration-300 ease-in-out z-50 max-w-[440px] text-ink
        "
        style="left: 50%; top: 50%; transform: translate(-50%, -50%)"
        ref="dialogRef">
            <div class="flex flex-col p-5">
                <div class="mb-4">
                    <div v-if="dialogKey === 'rpc_message_1'">
                        <div class="flex items-center gap-2 mb-3">
                            <svg class="h-4 w-4 text-signal shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <h2 class="eyebrow text-signal">Read this first</h2>
                        </div>
                        <div class="text-[12.5px] leading-relaxed text-ink-dim space-y-2">
                            <p>
                            This is only a feature in development.
                            </p>
                            <p>
                                It works but due to the nature that it tricks Discord into thinking you are playing a game
                                by sending an RPC using actual game ID rather than letting Discord detect you have a game/application running.
                            </p>
                            <p>
                            This may flag your account as suspicious for self-botting.
                            </p>
                        </div>
                    </div>

                    <div v-if="dialogKey === 'no_game_selected'">
                        <h2 class="eyebrow mb-3">Nothing selected</h2>
                        <p class="text-[12.5px] leading-relaxed text-ink-dim">
                            No game selected. Please select a game from the list on the left.
                        </p>
                    </div>
                </div>
                <div class="gap-2 flex justify-end">
                    <button
                    class="text-[11px] font-display uppercase tracking-[0.14em] text-ink-dim hover:text-ink
                    border border-line hover:border-ink-faint rounded-[6px] px-3.5 py-2 transition-colors"
                    @click="hideDialog()">
                    <span v-if="dialogKey === 'rpc_message_1'">
                        Cancel
                    </span>
                    <span v-else>OK</span>
                </button>

                <button
                v-if="dialogKey === 'rpc_message_1'"
                class="text-[11px] font-display uppercase tracking-[0.14em] text-deck-950 bg-signal hover:bg-signal/85
                rounded-[6px] px-3.5 py-2 transition-colors"
                @click="continueRPCRisk(selectedGame)">
                    Accept risk and continue
                </button>
                </div>
            </div>
        </dialog>

        <!-- ================= LIBRARY COLUMN =================
             Width matters more than it looks: the game names inside truncate to
             whatever room is left after the row controls, so a narrow column is
             what turns "Call of Duty: Modern Warfare 4" into "Call of Duty: ...".
             The window now has a 1024px minWidth, so the lg: width is the real
             floor here and the 320px variant only exists as a fallback. -->
        <aside class="w-[320px] lg:w-[400px] xl:w-[440px] shrink-0 flex flex-col min-h-0 border-r border-line/70 bg-deck-850/40 backdrop-blur-md">

            <!-- Search + refetch -->
            <div class="px-3 pt-3 pb-2.5 border-b border-line/60 shrink-0">
                <div class="relative" ref="searchResultContainerRef">
                    <div class="relative">
                        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-faint pointer-events-none"
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="7" stroke-linecap="round"/>
                            <path d="m20 20-4.2-4.2" stroke-linecap="round"/>
                        </svg>
                        <input ref="searchInputRef" v-model="searchQuery" type="text" placeholder="Search Discord Verified games..."
                            class="w-full bg-deck-900/70 border border-line rounded-[6px] pl-8 pr-9 py-2 text-[12.5px]
                            placeholder:text-ink-faint text-ink focus:outline-none focus:border-signal/60 transition-colors"
                            @focus="openSearchResults" @blur="handleSearchBlur" />

                        <!-- buttons to refetch game list -->
                        <button
                            @click="fetchGameList()"
                            title="Refetch Game List"
                            aria-label="Refetch Game List"
                            class="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center h-7 w-7 rounded-[5px]
                            text-ink-faint hover:text-signal hover:bg-deck-700/70 transition-colors">
                            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 11A8 8 0 1 0 6.3 6.3M20 4v6h-6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <div v-if="searchResultsIsOpen" @click="isOnSearchResults = true"
                        class="absolute z-50 mt-1.5 w-full bg-deck-850/95 backdrop-blur-xl border border-line rounded-[8px]
                        shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)] max-h-[420px] overflow-y-auto">
                        <div v-if="searchResults.length > 0">
                            <div v-for="game in searchResults" :key="game.item.id"
                                class="p-2.5 border-b border-line/60 last:border-b-0 hover:bg-deck-700/40 transition-colors">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="min-w-0">
                                        <!-- Wraps instead of truncating. Distinguishing "Modern Warfare 4"
                                             from "Modern Warfare 2" is the whole point of this list. -->
                                        <div class="text-[12.5px] text-ink leading-snug break-words" :title="game.item.name">
                                            {{ game.item.name }}
                                        </div>
                                        <div class="font-mono text-[10px] text-ink-faint mt-0.5">ID: {{ game.item.id }}</div>
                                    </div>
                                    <button @click="addGameToList(game.item)"
                                        class="shrink-0 font-display uppercase tracking-[0.12em] text-[9px] text-deck-950
                                        bg-signal hover:bg-signal/85 rounded-[5px] px-2 py-1.5 transition-colors">
                                        Add game to list
                                    </button>
                                </div>
                                <div class="mt-2 text-[10px]">
                                    <div class="eyebrow text-[8px] mb-1">Executables</div>
                                    <ul class="space-y-0.5">
                                        <li v-for="exe in game.item.executables" :key="exe.name"
                                            class="font-mono text-ink-dim truncate" :title="`${exe.name} (${exe.os})`">
                                            <span>
                                            {{ exe.name }}
                                            ({{ exe.os }})</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <!-- Some help -->
                        <div v-if="searchResults.length === 0"
                            class="p-3 text-[11.5px] leading-relaxed text-ink-dim">
                            Search for games by name. <br>
                            Click "Add game to list" to add them to your selected games.
                        </div>
                    </div>
                </div>

                <!-- refetch game list fetch status -->
                <Transition
                    enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                    leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"
                    enter-from-class="opacity-0 translate-y-2 ease-in-out"
                    enter-to-class="opacity-100 translate-y-0 ease-in-out"
                >
                    <div class="mt-2 space-y-1" v-if="shouldShowNotificationContainer && !allFetchDone">
                        <!-- Fetching from mirror loading indicator -->
                        <Transition
                            enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                            leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"
                            enter-from-class="opacity-0 translate-y-2 ease-in-out"
                            enter-to-class="opacity-100 translate-y-0 ease-in-out"
                        >
                            <div v-if="isLoadingGH" class="text-[10.5px] text-ink-dim">
                                Fetching game list from GitHub mirror...
                              <div class="h-1.5 w-1.5 bg-signal rounded-full inline-block ml-1.5 animate-pulse"></div>
                            </div>
                        </Transition>
                        <TimedNotification
                            :is-ready="isReadyGH"
                            :duration="1500"
                            container-class="text-[10.5px] text-ink-dim"
                        >
                            Game list from mirror fetched <span class="text-live">✓</span>
                        </TimedNotification>

                        <!-- Fetching from Discord loading indicator -->
                        <Transition
                            enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                            leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"
                            enter-from-class="opacity-0 translate-y-2 ease-in-out"
                            enter-to-class="opacity-100 translate-y-0 ease-in-out"
                        >
                            <div v-if="isLoadingDiscord" class="text-[10.5px] text-ink-dim">
                                Fetching game list directly from Discord...
                                <div class="h-1.5 w-1.5 bg-signal rounded-full inline-block ml-1.5 animate-pulse"></div>
                            </div>
                        </Transition>
                        <TimedNotification
                            :is-ready="isReadyDiscord"
                            :duration="1500"
                            container-class="text-[10.5px] text-ink-dim"
                        >
                            Game list from Discord fetched <span class="text-live">✓</span>
                        </TimedNotification>


                        <!-- Fetching from bundled loading indicator -->
                        <Transition
                            enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                            leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"
                            enter-from-class="opacity-0 translate-y-2 ease-in-out"
                            enter-to-class="opacity-100 translate-y-0 ease-in-out"
                        >
                            <div v-if="isLoadingBundled" class="text-[10.5px] text-ink-dim">
                                Fetching game list from bundled game list...
                                <div class="h-1.5 w-1.5 bg-signal rounded-full inline-block ml-1.5 animate-pulse"></div>
                            </div>
                        </Transition>
                        <TimedNotification
                            :is-ready="isReadyBundled"
                            :duration="1500"
                            container-class="text-[10.5px] text-ink-dim"
                        >
                            Game list from bundle pre-loaded <span class="text-live">✓</span>
                        </TimedNotification>

                    </div>
                </Transition>
            </div>

            <!-- List header. Outside the scroll area, so it actually stays put. -->
            <div class="flex items-center justify-between px-3.5 py-2 border-b border-line/40 shrink-0">
                <div class="flex items-baseline gap-2">
                    <h2 class="eyebrow">Games</h2>
                    <span class="font-mono text-[10px] text-signal">{{ gameList.length }}</span>
                </div>
                <button @click="toggleDensity" title="Toggle list density"
                    class="font-display uppercase tracking-[0.12em] text-[9px] text-ink-faint hover:text-ink
                    border border-line hover:border-ink-faint rounded-[5px] px-2 py-1 transition-colors">
                    {{ density === 'compact' ? '☰ Compact' : '▤ Comfortable' }}
                </button>
            </div>

            <!-- Rows -->
            <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                <div v-if="gameList.length === 0" class="text-center px-4 py-12">
                    <div class="text-3xl mb-3 opacity-30 grayscale">🎮</div>
                    <div class="text-[12.5px] text-ink mb-1">No games yet</div>
                    <div class="text-[11px] text-ink-dim leading-relaxed">Search above and add your first game to get started.</div>
                </div>
                <div v-else :class="density === 'compact' ? 'space-y-px' : 'space-y-1.5'">
                    <div v-for="(game, index) in gameList" :key="game.id"
                        class="group relative rounded-[6px] border cursor-pointer transition-colors duration-150"
                        :class="[
                            density === 'compact' ? 'px-2.5 py-1.5' : 'px-2.5 py-2.5',
                            selectedGame?.uid === game.uid
                                ? 'border-signal/40 bg-signal/[0.07]'
                                : 'border-transparent hover:border-line hover:bg-deck-700/40',
                        ]" @click="selectGame(game)"
                    >
                        <!-- amber marker on the selected row -->
                        <span v-if="selectedGame?.uid === game.uid"
                            class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-signal"></span>

                        <div class="flex items-start gap-2">
                            <!-- running dot -->
                            <span class="mt-[5px] shrink-0 h-1.5 w-1.5 rounded-full"
                                :class="game.is_running ? 'bg-live animate-pulse' : 'bg-ink-faint/40'"></span>

                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1">
                                    <div class="text-[12.5px] text-ink truncate" :title="game.name">{{ game.name }}</div>
                                    <div class="relative inline-flex items-center shrink-0">
                                        <div class="w-2 h-2 bg-white absolute rounded-full" style="left: 50%; top: 50%; transform: translate(-50%, -50%)"></div>
                                        <div class="relative inline-block">
                                         <IconVerified class="w-3.5 h-3.5 text-signal"></IconVerified>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 mt-0.5">
                                    <span class="font-mono text-[10px] text-ink-faint">{{ game.id }}</span>
                                    <span class="font-display uppercase tracking-[0.12em] text-[8.5px] text-live" v-if="game.is_running">
                                        Running
                                    </span>
                                </div>
                            </div>

                            <!-- row controls -->
                            <div class="flex items-center gap-0.5 shrink-0">
                                <button @click.stop="handleToggleFavorite(game)"
                                    :title="isFavorite(game.id) ? 'Remove from favorites' : 'Add to favorites'"
                                    class="grid place-items-center h-5 w-5 rounded text-[13px] leading-none transition-transform hover:scale-110"
                                    :class="isFavorite(game.id) ? 'text-signal' : 'text-ink-faint hover:text-signal'">
                                    {{ isFavorite(game.id) ? '★' : '☆' }}
                                </button>

                                <div class="flex flex-col">
                                    <button @click.stop="moveGameUp(index)" :disabled="index === 0"
                                        class="leading-none text-ink-faint hover:text-signal disabled:opacity-20 disabled:hover:text-ink-faint disabled:cursor-not-allowed"
                                        title="Move up">
                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 15 12 9 6 15" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    </button>
                                    <button @click.stop="moveGameDown(index)" :disabled="index === gameList.length - 1"
                                        class="leading-none text-ink-faint hover:text-signal disabled:opacity-20 disabled:hover:text-ink-faint disabled:cursor-not-allowed"
                                        title="Move down">
                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9 12 15 18 9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    </button>
                                </div>

                                <button @click.stop="removeGameFromList(game)" v-if="!game.is_running"
                                    title="Remove" aria-label="Remove"
                                    class="grid place-items-center h-5 w-5 rounded text-ink-faint hover:text-alert hover:bg-alert/10 transition-colors">
                                    <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                        <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>

        <!-- ================= SESSION COLUMN ================= -->
        <section class="flex-1 min-w-0 flex flex-col min-h-0" :key="forceRerenderKey">

            <!-- Product strip -->
            <div class="flex items-center justify-between gap-3 px-5 h-9 shrink-0 border-b border-line/60">
                <h1 class="eyebrow truncate">Discord Quest Completer</h1>
                <div class="flex items-center gap-1.5 shrink-0">
                    <span class="h-1.5 w-1.5 rounded-full" :class="isConnectedToRPC ? 'bg-live animate-pulse' : 'bg-ink-faint/50'"></span>
                    <span class="eyebrow" :class="isConnectedToRPC ? 'text-live' : ''">
                        {{ isDisconnecting ? 'Disconnecting…' : isConnecting ? 'Connecting…' : isConnectedToRPC ? 'Rich presence live' : 'Not connected' }}
                    </span>
                </div>
            </div>

            <!-- Session readout: the one thing this app exists to tell you. -->
            <div class="px-5 py-5 shrink-0 border-b border-line/60">
                <div class="flex items-start justify-between gap-5">
                    <div class="min-w-0">
                        <div class="eyebrow" :class="hasPlaySession || isConnectedToRPC ? 'text-signal' : ''">
                            {{ hasPlaySession
                                ? 'Local auto-stop timer'
                                : (isConnectedToRPC ? 'Session running' : (selectedGame ? 'Ready' : 'No game selected')) }}
                        </div>
                        <div class="mt-2 text-[13px] truncate" :class="selectedGame || hasPlaySession ? 'text-ink' : 'text-ink-faint'">
                            {{ nextExpiringSession
                                ? nextExpiringSession.gameName
                                : (selectedGame ? selectedGame.name : 'Pick a game from the list') }}
                        </div>
                        <div class="mt-2.5 font-mono leading-none text-[46px] lg:text-[54px]"
                            :class="hasPlaySession ? 'text-signal' : (isConnectedToRPC ? 'text-ink' : 'text-ink-faint/60')">
                            {{ hasPlaySession
                                ? formatCountdown(remainingMs(nextExpiringSession))
                                : (isConnectedToRPC ? sessionElapsed : '00:00:00') }}
                        </div>
                        <p class="mt-3 text-[11.5px] leading-relaxed text-ink-dim max-w-[52ch]">
                            <span v-if="hasPlaySession">Local {{ formatCountdown(AUTO_STOP_MS) }} timer per executable. At zero, the app attempts to close the helper. Quest requirements and progress are not tracked. Check completion in Discord.</span>
                            <span v-else-if="isConnectedToRPC">Rich Presence is connected. This app does not track quest progress or confirm completion. Check Discord.</span>
                            <span v-else-if="selectedGame">Nothing is being sent yet. Connect to start the clock.</span>
                            <span v-else>Add a game, then select it to send Rich Presence.</span>
                        </p>
                    </div>

                    <button @click="handleTestRPC(selectedGame)" :disabled="isDisconnecting"
                        class="shrink-0 font-display uppercase tracking-[0.14em] text-[10px] rounded-[6px] px-4 py-2.5 transition-colors"
                        :class="isConnecting || isConnectedToRPC
                            ? 'border border-alert/50 text-alert hover:bg-alert/10'
                            : 'bg-signal text-deck-950 hover:bg-signal/85'">
                        {{ isDisconnecting ? 'Disconnecting…' : isConnecting ? 'Cancel connection' : isConnectedToRPC ? 'Disconnect from Discord' : 'Test RPC' }}
                    </button>
                </div>

                <div v-if="isConnectedToRPC" class="mt-4 flex items-center gap-2 text-[11px] text-live bg-live/5 border border-live/25 rounded-[6px] px-3 py-2">
                    <span class="w-1.5 h-1.5 rounded-full bg-live animate-pulse"></span>
                    <span class="text-ink-dim">Session time:</span>
                    <span class="font-mono text-ink">{{ sessionElapsed }}</span>
                </div>

                <!-- One row per launched executable: each runs its own window and
                     closes itself independently of the others. -->
                <div v-if="hasPlaySession" class="mt-4 space-y-1.5">
                    <div v-for="session in playSessions" :key="session.key"
                        class="flex items-center gap-2 text-[11px] bg-signal/[0.06] border border-signal/25 rounded-[6px] px-3 py-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-signal animate-pulse shrink-0"></span>
                        <span class="font-mono text-[10.5px] text-ink-dim truncate min-w-0">{{ session.executableName }}</span>
                        <span class="ml-auto shrink-0 text-ink-faint">local timer</span>
                        <span class="font-mono text-signal shrink-0">{{ formatCountdown(remainingMs(session)) }}</span>
                    </div>
                </div>

                <!-- <button :disabled="!canCreateDummyGame(selectedGame)" @click="createDummyGame(selectedGame)" class="w-full py-2 rounded-lg"
                    :class="[
                        canCreateDummyGame(selectedGame)
                            ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                            : 'bg-cyan-400 cursor-not-allowed text-gray-200'
                    ]">
                    Create Dummy Game
                </button> -->
            </div>

            <!-- Detail panes -->
            <div class="flex-1 min-h-0 overflow-y-auto">
                <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] min-h-full">

                    <!-- Target + actions -->
                    <div class="px-5 py-4 min-w-0">
                        <h2 class="eyebrow">Game Actions</h2>

                        <div class="text-[11.5px] text-ink-dim mt-3" v-if="!selectedGame || selectedGame === null">
                            Select a game from the left to perform actions.
                        </div>

                        <dl v-if="selectedGame" class="kv mt-3.5">
                            <dt>Name</dt>
                            <dd class="font-sans text-[12.5px]">{{ selectedGame.name }}</dd>
                            <dt>App id</dt>
                            <dd>{{ selectedGame.id }}</dd>
                            <template v-if="selectedGame.aliases && selectedGame.aliases.length > 0">
                                <dt>Aliases</dt>
                                <dd>
                                    <span v-for="alias in selectedGame.aliases" :key="alias"
                                        class="inline-block mr-1 mb-1 border border-line rounded px-1.5 py-px text-[10.5px] text-ink-dim">{{ alias }}</span>
                                </dd>
                            </template>
                        </dl>

                        <!-- divider -->
                        <div v-if="selectedGame" class="border-t border-line/60 my-4"></div>

                        <div v-if="selectedGame">
                            <h3 class="eyebrow mb-3">Launch</h3>
                            <GameExecutables v-if="selectedGame" :game="selectedGame"
                                @play="playGame"
                                @stop="stopPlaying"
                                @install_and_play="installAndPlay"
                            />
                        </div>

                        <!-- Divider -->
                        <div v-if="selectedGame" class="border-t border-line/60 my-4"></div>

                        <div v-if="selectedGame">
                            <h3 class="eyebrow mb-2.5">Game Info</h3>
                            <!-- Game info: every executable Discord lists for this app id, including
                                 the launcher and other-OS entries that the launch list filters out. -->
                            <div class="text-[10px] text-ink-faint mb-2">
                                Everything Discord's verified list has on file for this app.
                            </div>
                            <ul class="space-y-1">
                                <li v-for="exe in getExecutables(selectedGame)" :key="exe"
                                    class="font-mono text-[10.5px] text-ink-dim break-all border-l border-line pl-2">
                                    {{ exe }}
                                </li>
                            </ul>
                        </div>

                        <!-- <button @click="playGame(selectedGame)" :disabled="!canPlayGame(selectedGame)"
                            class="w-full py-2 rounded-lg" :class="[
                                !canPlayGame(selectedGame)
                                    ? 'bg-green-400 cursor-not-allowed text-gray-100'
                                    : 'bg-green-600 hover:bg-green-600 text-white'
                            ]">
                            {{ currentlyPlaying === selectedGame?.id ? 'Playing...' : 'Play' }}
                        </button>

                        <button @click="stopPlaying(selectedGame)" :disabled="!selectedGame?.is_running" :class="[
                            'w-full py-2 rounded-lg',
                            !selectedGame?.is_running
                                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                                : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                        ]">
                            Stop Playing
                        </button> -->
                    </div>

                    <!-- What Discord shows other people -->
                    <div class="px-5 py-4 min-w-0 border-t lg:border-t-0 lg:border-l border-line/60 bg-deck-900/25">
                        <h2 class="eyebrow">Discord sees</h2>

                        <div class="mt-3.5 rounded-[8px] border border-line bg-deck-850/60 p-3">
                            <div class="flex items-center gap-2.5">
                                <div class="h-10 w-10 shrink-0 rounded-[6px] grid place-items-center font-display text-[15px] border"
                                    :class="isConnectedToRPC
                                        ? 'bg-signal/15 text-signal border-signal/30'
                                        : 'bg-deck-800 text-ink-faint border-line'">
                                    {{ selectedGame ? selectedGame.name.charAt(0).toUpperCase() : '?' }}
                                </div>
                                <div class="min-w-0">
                                    <div class="text-[9.5px] uppercase tracking-[0.12em] font-display text-ink-faint">Playing a game</div>
                                    <div class="text-[12.5px] text-ink truncate mt-0.5">
                                        {{ selectedGame ? selectedGame.name : 'Nothing yet' }}
                                    </div>
                                    <div class="font-mono text-[10.5px] mt-0.5"
                                        :class="isConnectedToRPC ? 'text-live' : 'text-ink-faint'">
                                        {{ isConnectedToRPC ? sessionElapsed + ' elapsed' : 'not broadcasting' }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-3 rounded-[8px] border border-line bg-deck-850/40 p-3">
                            <h3 class="eyebrow mb-2">Status</h3>
                            <div class="text-[11.5px] leading-relaxed text-ink-dim">
                                Check Discord to see if it displays that you are playing a game.
                            </div>
                            <div v-if="currentlyPlaying" class="mt-2.5 flex items-center gap-1.5 text-[11.5px] min-w-0">
                                <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-live animate-pulse"></span>
                                <span class="text-ink-dim shrink-0">Currently playing:</span>
                                <span class="text-live truncate">{{ gameList.find(g => g.id ===
                                    currentlyPlaying)?.name }}</span>
                            </div>
                            <div v-else class="mt-2.5 text-[11.5px] text-ink-faint">
                                Not playing any game
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <UndoToast ref="undoToastRef" />
    </div>
</template>

<style scoped>
@reference "../theme/style.css";

.dialogStyle::backdrop {
    @apply bg-black/70 backdrop-blur-xs;
}
</style>
