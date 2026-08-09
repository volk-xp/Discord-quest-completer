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
import { GameActionsKey } from '@/constants/constants';
import { path } from '@tauri-apps/api';
import { emit } from '@tauri-apps/api/event';
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
const isConnectedToRPC = ref(false);
const isConnecting = ref(false);
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
const sessionElapsed = ref('00:00:00');
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
    if (!game?.uid) return;
    toggleFavoriteGame(game);
    // Regroup: favorites first (preserving their relative order), then the rest
    const favs = gameList.value.filter(g => isFavorite(g.uid));
    const rest = gameList.value.filter(g => !isFavorite(g.uid));
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

// Game status
const currentlyPlaying = ref<string | null>(null);


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
        notify('success', 'Game list refreshed');
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
    if (!game?.uid) return;
    let found = gameList.value.find(g => g.uid === game.uid);
    if (!found) {
        // The favorited game isn't currently in Home's session list
        // (e.g. it was removed, or the app was just restarted) — add it
        // back so Play works seamlessly regardless.
        gameList.value = [...gameList.value, game];
        found = game;
    }
    selectGame(found);
}

onMounted(() => {
    window.addEventListener('dqc:focus-search', handleFocusSearchEvent);
    window.addEventListener('dqc:select-game', handleSelectFavoriteGame);
});

onUnmounted(() => {
    if (sessionTimerInterval) {
        clearInterval(sessionTimerInterval);
    }
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

// Function to add a game to the selected list
function addGameToList(game: Game) {
    if (!gameList.value.some(g => g.id === game.id)) {
        gameList.value.push({
            uid: randomString(),
            ...game
        });
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
        const payload =  { 
            path: executable.path,
            executable_name: executable.filename,
            path_len: executable.segments,
            app_id: Number(gameToInstall.id),
        }
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
    const gameCreated = await createDummyGame(game, executable);
    if (gameCreated) {
        playGame({game, executable});
    } else {
        console.error('Failed to create game');
        addLog('error', 'Failed to create game');
    }
}
// Play game function
async function playGame({game, executable}: {game: Game, executable: GameExecutable}) {
    if (!game) {
        return;
    }
    const gameUid = game.uid;
    try {
        console.log(`Playing game: ${gameUid}`);
        addLog('info', `Playing game: ${game.name}`);
        addLog('info', `Executable: ${executable.name}`);
        currentlyPlaying.value = game.id;
        // find the game in the list
        const gameToPlay = gameList.value.find(g => g.uid === gameUid);
        const executableItem = gameToPlay?.executables.find(exe => exe.name === executable.name);
        if (gameToPlay && executableItem) {
            const payload =  { 
                name: game.name,
                path: executable.path,
                executable_name: executable.filename,
                path_len: executable.segments,
                app_id: Number(gameToPlay.id),
                exec_path: path.join(executable.path!, executable.filename!),
            } 
            await invoke('run_background_process', payload);
            gameToPlay.is_running = true;
            executableItem.is_running = true; 
            notify('success', `Launched ${game.name}`);
            addHistoryEntry(game.name, 'launched');
        }
        // In a real app, this would invoke a Tauri command to launch the game
       
    } catch (error) {
        console.error('Failed to launch game:', error);
        notify('error', `Failed to launch ${game.name}`);
    }
}

// Stop playing
async function stopPlaying({game, executable}: {game: Game, executable: GameExecutable}) {
    if (!game) {
        return;
    }
    console.log('Stopped playing game');
    const gameUid = game.uid;
    
    currentlyPlaying.value = null;

    const gameToPlay = gameList.value.find(g => g.uid === gameUid);
    const executableItem = gameToPlay?.executables.find(exe => exe.name === executable.name);
    if (gameToPlay && executableItem) {
        try {
            await invoke('stop_process', {
                exec_name: executable.filename!
            })
            addLog('info', `Stopped game process: ${game.name}`);
            addLog('info', `Stopped Executable: ${executable.name}`);
            notify('info', `Stopped ${game.name}`);
            addHistoryEntry(game.name, 'stopped');
        } catch (error) {
            console.error('Failed to stop game process:', error);
            const errorMessage = (error instanceof Error) ? error.message : String(error);
            addLog('error', 'Failed to stop game process' + errorMessage);
            notify('error', `Failed to stop ${game.name}`);
            // Even if stopping fails, we still update the state
            gameToPlay.is_running = false;
            executableItem.is_running = false;
        } finally {
            gameToPlay.is_running = false;
            executableItem.is_running = false;
        }
    }
}

function getExecutables(game: Game) {
    return game.executables.map(exe => exe.name)
}

async function handleTestRPC(game: Game | null) {
    let state = isConnectedToRPC.value ? 'disconnect' : 'connect';

    console.log('Testing RPC for game:', game);
    if (!game && state === 'connect') {
        showDialog('no_game_selected');
        return;
    }
    if (state === 'disconnect' || isConnecting.value) {
        // await invoke('connect_to_discord_rpc_2', { app_id: "0", discord_state: "disconnect" })
        // invoke('connect_to_discord_rpc_3', {
        //     activity_json: JSON.stringify({
        //         app_id: selectedGame.value?.id
        //     }),
        //     action: 'disconnect',
        // })
        emit('event_disconnect');
        
        isConnectedToRPC.value = false;
        notify('info', `Disconnected from Discord Rich Presence`);
        addHistoryEntry(game!.name, 'rpc_disconnected');
        game!.is_running = false;
        currentlyPlaying.value = null;
        isConnecting.value = false;
        stopSessionTimer();
        return;
    }
    showDialog('rpc_message_1');
}

async function continueRPCRisk(game: Game | null) {
    if (!game) {
        return;
    }
    const gameUid = game.uid;
    const gameToTest = gameList.value.find(g => g.uid === gameUid);
    if (gameToTest) {
        console.log('Testing RPC for game:', gameToTest);
        isConnecting.value = true;
        // invoke('connect_to_discord_rpc_2', { app_id: gameToTest.id, discord_state: "connect" })
        invoke('connect_to_discord_rpc_3', {
            activity_json: JSON.stringify({
                app_id: gameToTest.id,
            }),
            action: 'connect',
        })
        .then(() => {
            isConnectedToRPC.value = true;
            gameToTest.is_running = true;
            currentlyPlaying.value = gameToTest.id;
            isConnecting.value = false;
            startSessionTimer();
            notify('success', `Connected to Discord Rich Presence — ${gameToTest.name}`);
            addHistoryEntry(gameToTest.name, 'rpc_connected');
        })

        hideDialog();
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
    <div class="container mx-auto px-4 py-8">
        <!-- Center dialog -->
        <dialog id="dialog" class="dialogStyle inset-0 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl bg-opacity-50
        border border-cyan-300 dark:border-cyan-900 rounded-lg
        transition-opacity duration-300 ease-in-out z-50
        "
        style="left: 50%; top: 50%; transform: translate(-50%, -50%)"
        ref="dialogRef">
            <div class="flex flex-col items-center justify-center p-6" >
                <div class="mb-4 text-gray-500 dark:text-gray-400">
                    <div v-if="dialogKey === 'rpc_message_1'">
                        <p>
                        This is only a feature in development.  
                        </p>
                        <p class="my-2">
                            It works but due to the nature that it tricks Discord into thinking you are playing a game
                            by sending an RPC using actual game ID rather than letting Discord detect you have a game/application running. 
                        </p>
                        <p>
                        This may flag your account as suspicious for self-botting.
                        </p>
                    </div>

                    <div v-if="dialogKey === 'no_game_selected'">
                        <p>
                            No game selected. Please select a game from the list on the left.
                        </p>
                    </div>
                </div>
                <div class="gap-2 flex">
                    <button
                    
                    class="
                text-gray-500 dark:text-cyan-300/80 hover:text-gray-700 dark:hover:text-cyan-200 
                border border-gray-300 dark:border-cyan-800 rounded-lg px-4 py-1"
                @click="hideDialog()">
                    <span  v-if="dialogKey == 'rpc_message_1'">
                        Cancel 
                    </span>
                    <span v-else>OK</span>
                </button>
                
                <button 
                v-if="dialogKey === 'rpc_message_1'"
                class="text-gray-500 dark:text-cyan-300/80 hover:text-gray-700 dark:hover:text-cyan-200 
                border border-gray-300 dark:border-cyan-800 rounded-lg px-4 py-1"
                @click="continueRPCRisk(selectedGame)">
                    Accept risk and continue
                </button>
                </div>
            </div>
        </dialog>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center">
            Discord QC
        </h1>

        <div class="flex justify-center mb-6">
            <span class="text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-900 px-3 py-1 rounded-full flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full" :class="isConnectedToRPC ? 'bg-green-500' : 'bg-cyan-500'"></span>
                {{ isConnectedToRPC ? 'Connected' : 'Idle' }}
            </span>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-6 max-w-2xl mx-auto">
            <div class="bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm border border-gray-200 dark:border-cyan-900/50 rounded-lg p-3 text-center">
                <div class="text-xs text-gray-500 dark:text-cyan-300/70">Games tracked</div>
                <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ gameList.length }}</div>
            </div>
            <div class="bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm border border-gray-200 dark:border-cyan-900/50 rounded-lg p-3 text-center">
                <div class="text-xs text-gray-500 dark:text-cyan-300/70">Verified games</div>
                <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ gameDB.length }}</div>
            </div>
            <div class="bg-white/80 dark:bg-slate-900/40 backdrop-blur-sm border border-gray-200 dark:border-cyan-900/50 rounded-lg p-3 text-center">
                <div class="text-xs text-gray-500 dark:text-cyan-300/70">RPC status</div>
                <div class="text-lg font-semibold" :class="isConnectedToRPC ? 'text-green-500' : 'text-cyan-500'">
                    {{ isConnectedToRPC ? 'Live' : 'Off' }}
                </div>
            </div>
        </div>

        <!-- refetch game list fetch status. will appear on top left -->
        <Transition 
            enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
            leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"  
            enter-from-class="opacity-0 translate-y-2 ease-in-out"
            enter-to-class="opacity-100 translate-y-0 ease-in-out"
        >
            <div class="absolute top-20 left-4 z-20 " v-if="shouldShowNotificationContainer && !allFetchDone">
                <!-- Fetching from mirror loading indicator --> 
                <Transition 
                    enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                    leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"  
                    enter-from-class="opacity-0 translate-y-2 ease-in-out"
                    enter-to-class="opacity-100 translate-y-0 ease-in-out"
                >
                    <div v-if="isLoadingGH" class="text-sm text-gray-500 dark:text-gray-400">
                        Fetching game list from GitHub mirror... 
                      <div class="border-full h-2 w-2 bg-green-500 rounded-full inline-block ml-2 animate-pulse"></div>
                    </div>
                </Transition>
                <TimedNotification
                    :is-ready="isReadyGH" 
                    :duration="1500"
                    container-class="text-sm text-gray-500 dark:text-gray-400"
                > 
                    Game list from mirror fetched <span class="text-green-400">✓</span>
                </TimedNotification>

                <!-- Fetching from Discord loading indicator -->
                <Transition 
                    enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                    leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"  
                    enter-from-class="opacity-0 translate-y-2 ease-in-out"
                    enter-to-class="opacity-100 translate-y-0 ease-in-out"
                >
                    <div v-if="isLoadingDiscord" class="text-sm text-gray-500 dark:text-gray-400">
                        Fetching game list directly from Discord...
                        <div class="border-full h-2 w-2 bg-green-500 rounded-full inline-block ml-2 animate-pulse"></div>
                    </div>
                </Transition>
                <TimedNotification
                    :is-ready="isReadyDiscord" 
                    :duration="1500"
                    container-class="text-sm text-gray-500 dark:text-gray-400"
                > 
                    Game list from Discord fetched <span class="text-green-400">✓</span>
                </TimedNotification>

                
                <!-- Fetching from bundled loading indicator -->
                <Transition 
                    enter-active-class="transition-opacity duration-300 delay-100 ease-in-out"
                    leave-active-class="transition-opacity duration-600 delay-100 ease-in-out"  
                    enter-from-class="opacity-0 translate-y-2 ease-in-out"
                    enter-to-class="opacity-100 translate-y-0 ease-in-out"
                >
                    <div v-if="isLoadingBundled" class="text-sm text-gray-500 dark:text-gray-400">
                        Fetching game list from bundled game list...
                        <div class="border-full h-2 w-2 bg-green-500 rounded-full inline-block ml-2 animate-pulse"></div>
                    </div>
                </Transition>
                <TimedNotification
                    :is-ready="isReadyBundled" 
                    :duration="1500"
                    container-class="text-sm text-gray-500 dark:text-gray-400"
                > 
                    Game list from bundle pre-loaded <span class="text-green-400">✓</span>
                </TimedNotification>

            </div>
        </Transition>

        <!-- Search Bar -->
        <div class="mb-8">
            <div class="relative" ref="searchResultContainerRef">
               <div>
                 <input ref="searchInputRef" v-model="searchQuery" type="text" placeholder="Search Discord Verified games..."
                    class="w-full px-4 py-2 border border-cyan-200 dark:border-cyan-900 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 dark:bg-slate-900/50 dark:backdrop-blur-sm dark:text-white"
                    @focus="openSearchResults" @blur="handleSearchBlur" />

                <!-- buttons to refetch game list -->
                <button
                    @click="fetchGameList()"
                    class="absolute right-0 top-1/2 transform -translate-y-1/2 px-3 mr-2 py-1 text-sm bg-cyan-100 dark:bg-cyan-900/50 hover:bg-cyan-200 dark:hover:bg-cyan-800/70 text-cyan-700 dark:text-cyan-200 rounded-md border border-cyan-200 dark:border-cyan-800">
                    <span class="wrap whitespace-nowrap text-xs">
                        Refetch Game List
                    </span>
                </button>   
               </div>
                <div v-if="searchResultsIsOpen" @click="isOnSearchResults = true"
                    class="absolute z-50 mt-1 w-full bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl border border-cyan-200 dark:border-cyan-900 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div v-if="searchResults.length > 0">
                        <div v-for="game in searchResults" :key="game.item.id"
                            class="p-3 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border-b border-cyan-100 dark:border-cyan-900/50 last:border-b-0">
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="font-medium text-gray-800 dark:text-white">
                                        {{ game.item.name }}
                                    </div>
                                    <div class="text-sm text-gray-500 dark:text-gray-400">ID: {{ game.item.id }}</div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                        Executables:
                                        <ul class="list-disc list-inside">
                                            <li v-for="exe in game.item.executables" :key="exe.name"
                                                class="text-gray-500 dark:text-gray-400">
                                                <span class="font-mono">
                                                {{ exe.name }}
                                                ({{ exe.os }})</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                                <button @click="addGameToList(game.item)"
                                    class="ml-2 px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-md">
                                    Add game to list
                                </button>
                            </div>
                        </div>
                    </div>
                    <!-- Some help -->
                    <div v-if="searchResults.length === 0"
                        class="p-3 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border-b border-cyan-100 dark:border-cyan-900/50 last:border-b-0 text-gray-500 dark:text-gray-400">
                        Search for games by name. <br>
                        Click "Add game to list" to add them to your selected games.
                    </div>
                </div>
            </div>
        </div>

        <!-- Two-Column Layout with right fixed column -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
            <!-- Left Column: Selected Games (scrollable) -->
            <!--  max-h-[70vh] overflow-y-auto : add these somewhere to just scroll the content  -->
            <div class="bg-white/85 dark:bg-slate-900/40 backdrop-blur-md p-4 rounded-lg shadow border border-transparent dark:border-cyan-900/40 dark:shadow-[0_0_20px_-8px_rgba(34,211,238,0.25)]">
                <div
                    class="flex items-center justify-between mb-4 sticky top-0 bg-white/85 dark:bg-slate-900/60 backdrop-blur-md py-2 z-10 rounded-md">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">Games</h2>
                    <button @click="toggleDensity" title="Toggle list density"
                        class="text-gray-400 dark:text-cyan-300/70 hover:text-cyan-500 dark:hover:text-cyan-400 text-xs border border-gray-200 dark:border-cyan-900/50 rounded-md px-2 py-1">
                        {{ density === 'compact' ? '☰ Compact' : '▤ Comfortable' }}
                    </button>
                </div>
                <div v-if="gameList.length === 0" class="text-center py-10">
                    <div class="text-3xl mb-2 opacity-50">🎮</div>
                    <div class="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1">No games yet</div>
                    <div class="text-gray-500 dark:text-gray-400 text-xs">Search above and add your first game to get started.</div>
                </div>
                <div v-else :class="density === 'compact' ? 'space-y-1' : 'space-y-4'">
                    <div v-for="(game, index) in gameList" :key="game.id" 
                        class="border border-gray-200 dark:border-cyan-900/30 rounded-lg
                        hover:bg-gray-100 dark:hover:bg-cyan-950/30 transition-colors 
                        duration-200 ease-in-out" 
                        :class="[
                            density === 'compact' ? 'p-2' : 'p-3',
                            {
                                'ring-1 ring-cyan-500/40 shadow-[0px_0px_8px_2px_#22d3ee50] bg-gray-100 dark:bg-gray-700/40': selectedGame?.uid === game.uid,
                            }
                        ]" @click="selectGame(game)"
                    >
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-1">
                                <div class="flex flex-col mr-1">
                                    <button @click.stop="moveGameUp(index)" :disabled="index === 0"
                                        class="leading-none text-gray-400 dark:text-gray-600 hover:text-cyan-400 disabled:opacity-20 disabled:hover:text-gray-400 disabled:cursor-not-allowed"
                                        title="Move up">
                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 15 12 9 6 15" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    </button>
                                    <button @click.stop="moveGameDown(index)" :disabled="index === gameList.length - 1"
                                        class="leading-none text-gray-400 dark:text-gray-600 hover:text-cyan-400 disabled:opacity-20 disabled:hover:text-gray-400 disabled:cursor-not-allowed"
                                        title="Move down">
                                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9 12 15 18 9" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    </button>
                                </div>
                                <button @click.stop="handleToggleFavorite(game)" class="mr-2 text-2xl leading-none transition-transform hover:scale-110"
                                    :class="isFavorite(game.uid) ? 'text-amber-400' : 'text-gray-400 dark:text-gray-600 hover:text-amber-400'">
                                    {{ isFavorite(game.uid) ? '★' : '☆' }}
                                </button>
                                <div class="font-medium text-gray-800 dark:text-white">{{ game.name }}</div>
                                <div class="relative inline-flex items-center">
                                    <div class="w-2 h-2 bg-white absolute rounded-full" style="left: 50%; top: 50%; transform: translate(-50%, -50%)"></div>
                                    <div class="relative inline-block">
                                     <IconVerified class="w-5 h-5 text-cyan-500 dark:text-cyan-400"></IconVerified>
                                    </div>
                                </div>
                            </div>
                            <button @click="removeGameFromList(game)" class="text-cyan-300 hover:text-cyan-400"
                                v-if="!game.is_running"> 
                                Remove
                            </button>
                        </div>
                        <div class="flex space-x-2 mt-2">
                            <!-- Previously play button was here -->
                            <div class="text-sm text-green-500 dark:text-green-400" v-if="game.is_running">
                                Running
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Column: Game Actions (fixed position) -->
            <div class="bg-white/85 dark:bg-slate-900/40 backdrop-blur-md p-4 rounded-lg shadow border border-transparent dark:border-cyan-900/40 dark:shadow-[0_0_20px_-8px_rgba(34,211,238,0.25)] md:sticky md:top-4 self-start" :key="forceRerenderKey">
                <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Game Actions</h2>
                <div class="space-y-4">
                    <div class="text-gray-500 dark:text-gray-400 mb-2 text-sm" v-if="!selectedGame || selectedGame === null">
                        Select a game from the left to perform actions.
                    </div>
                    
                    <div v-if="selectedGame" class="text-gray-500 dark:text-gray-400 mb-4 text-sm">
                        <strong>Name:</strong> {{ selectedGame.name }}<br>
                        <strong>ID:</strong> {{ selectedGame.id }}<br>
                        <strong v-if="selectedGame.aliases && selectedGame.aliases.length > 0">Aliases:</strong>
                        <ul v-if="selectedGame.aliases && selectedGame.aliases.length > 0" class="list-disc list-inside" >
                            <li v-for="alias in selectedGame.aliases" :key="alias"
                                class="text-gray-500 dark:text-gray-400">
                                <span class="font-mono">{{ alias }}</span>
                            </li>
                        </ul>
                    </div>
                    <button @click="handleTestRPC(selectedGame)"
                        class="w-full py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white">
                        {{ isConnecting || isConnectedToRPC ? 'Disconnect to Discord Gateway' : 'Test RPC' }}
                    </button>

                    <div v-if="isConnectedToRPC" class="flex items-center justify-center gap-2 text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-900/50 rounded-lg py-2">
                        <span class="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                        <span>Session time: <span class="font-mono font-semibold text-white">{{ sessionElapsed }}</span></span>
                    </div>

                    <!-- <button :disabled="!canCreateDummyGame(selectedGame)" @click="createDummyGame(selectedGame)" class="w-full py-2 rounded-lg"
                        :class="[
                            canCreateDummyGame(selectedGame)
                                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                                : 'bg-cyan-400 cursor-not-allowed text-gray-200'
                        ]">
                        Create Dummy Game
                    </button> -->

                    <!-- divider -->
                    <div class="border-t border-gray-200 dark:border-cyan-900/40 my-4"></div>

                    <GameExecutables v-if="selectedGame" :game="selectedGame" 
                        @play="playGame"
                        @stop="stopPlaying"
                        @install_and_play="installAndPlay"
                    />

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

                <!-- Divider -->
                <div class="border-t border-gray-200 dark:border-cyan-900/40 my-5"></div>

                <div class="mt-6 p-4 border border-gray-200 dark:border-cyan-900/40 dark:bg-cyan-950/10 rounded-lg">
                    <h3 class="font-medium text-gray-800 dark:text-white mb-2">Status</h3>
                    <div class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        Check Discord to see if it displays that you are playing a game.
                    </div>
                    <div v-if="currentlyPlaying" class="text-gray-500 dark:text-gray-400">
                        Currently playing: <span class="text-green-600"> {{gameList.find(g => g.id ===
                            currentlyPlaying)?.name }}</span>
                    </div>
                    <div v-else class="text-gray-500 dark:text-gray-400">
                        Not playing any game
                    </div>
                </div>

                <div v-if="selectedGame" class="my-4">
                    <h3 class="font-medium text-gray-800 dark:text-white mb-2">Game Info</h3>
                    <!-- Game info -->
                    <!-- <div class="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    
                        <strong>Aliases:</strong>
                        <ul class="list-disc list-inside">
                            <li v-for="alias in selectedGame.aliases" :key="alias"
                                class="text-gray-500 dark:text-gray-400">
                                <span class="font-mono">{{ alias }}</span>
                            </li>
                        </ul>
                        <strong>Executables:</strong>
                        <ul class="list-disc list-inside">
                            <li v-for="exe in getExecutables(selectedGame)" :key="exe"
                                class="text-gray-500 dark:text-gray-400">
                                <span class="font-mono">{{ exe }}</span>
                            </li>
                        </ul>
                    </div> -->
                </div>
            </div>
        </div>

        <UndoToast ref="undoToastRef" />
    </div>
</template>

<style scoped>
@reference "../theme/style.css";

.dialogStyle::backdrop {
    @apply bg-black/70 backdrop-blur-xs;
}
</style>