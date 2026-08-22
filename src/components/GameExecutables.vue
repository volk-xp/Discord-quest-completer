<template>
    <div>
        <h3 class="text-[11.5px] leading-relaxed text-ink-dim">
            The game has multiple platform executables. Please select one to launch:
        </h3>

        <div class="mt-3 space-y-1.5">
            <div v-for="(executable) in filteredExecutables" :key="executable.name"
                class="grid grid-cols-[auto_1fr_auto] gap-2.5 items-center w-full rounded-[6px] border border-line
                bg-deck-850/50 px-2.5 py-2">
                <div class="shrink-0">
                    <div class="font-display uppercase tracking-[0.12em] text-[8.5px] text-ink-dim bg-deck-800 border border-line rounded px-1.5 py-1 w-fit">
                        {{ executable.os }}
                    </div>
                </div>

                <!-- Sections / Breadcrumbs must fade when too long -->
                <div class="relative overflow-hidden min-w-0">
                    <div class="flex flex-nowrap overflow-x-auto scrollbar-none max-w-full pr-4 fade-right">
                        <div v-for="(section, i) in splitExecutableName(executable)" :key="i"
                            class="font-mono text-[10.5px] text-ink-dim border border-line rounded px-1.5 py-0.5 mr-1 whitespace-nowrap">
                            <span>{{ section }}</span>
                        </div>
                    </div>
                </div>

                <div class="justify-self-end flex items-center gap-2 shrink-0">
                    <span v-if="playSessionFor(executable)"
                        class="font-mono text-[9.5px] text-signal shrink-0"
                        title="Time left before this window closes automatically">
                        {{ formatCountdown(remainingMs(playSessionFor(executable))) }}
                    </span>
                    <span class="flex items-center gap-1 font-display uppercase tracking-[0.12em] text-[8.5px]"
                        :class="gameActions?.isExecutableRunning(executable) ? 'text-live' : 'text-ink-faint'">
                        <span class="w-1.5 h-1.5 rounded-full"
                            :class="gameActions?.isExecutableRunning(executable) ? 'bg-live animate-pulse' : 'bg-ink-faint/50'"></span>
                        {{ gameActions?.isExecutableRunning(executable) ? 'Running' : 'Stopped' }}
                    </span>
                    <button class="font-display uppercase tracking-[0.14em] text-[9px] rounded-[5px] px-2.5 py-1.5 transition-colors"
                    :class="[
                        {
                            'bg-signal text-deck-950 hover:bg-signal/85': !gameActions?.isExecutableRunning(executable),
                            'border border-alert/50 text-alert hover:bg-alert/10': gameActions?.isExecutableRunning(executable),
                        },
                    ]"
                        @click="handleLaunch(executable)"
                    >
                        {{ gameActions?.isExecutableRunning(executable) ? 'Stop' : 'Play' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { EXECUTABLE_OS, GameActionsKey } from '@/constants/constants';
import { GameActionsProvider, type Game, type GameExecutable } from '@/types/types';
import { path, app } from '@tauri-apps/api';
import { computed, inject } from 'vue';
import { usePlaySessions } from '@/composables/use-play-sessions';

const props = defineProps<{
    game: Game
}>();

const emit = defineEmits<{
    play: [{game: Game, executable: GameExecutable}]
    stop: [{game: Game, executable: GameExecutable}]
    install_and_play: [{game: Game, executable: GameExecutable}]
}>();

const gameActions = inject<GameActionsProvider>(GameActionsKey);

const { getPlaySession, remainingMs, formatCountdown } = usePlaySessions();

// Each launched executable runs its own auto-stop window, so the countdown is
// looked up per row rather than read from a single shared session.
function playSessionFor(executable: GameExecutable) {
    return getPlaySession(props.game.uid, executable.name);
}

const filteredExecutables = computed(() => {
    return props.game.executables.filter(executable => {
        // currently no support for linux and darwin
        return executable.os !== EXECUTABLE_OS.LINUX && executable.os !== EXECUTABLE_OS.DARWIN
            && !isValidPath(executable.name);
    });
});

function splitExecutableName(executable: GameExecutable) {
    const allSections = executable.name.split(/\\|\//);
    
    const last = executable.name.split(/\\|\//).pop();
    // remove file extension if there was none, just return the last section
    const name = last?.split('.').slice(0, -1).join('.') || last;
    return [
        ...allSections.slice(0, -1),
        name,
    ];
}

function getExecutablePath(executable: GameExecutable) {
    const allSections = executable.name.split(/\\|\//);
    const last = executable.name.split(/\\|\//).pop();
    // remove file extension if there was none, just return the last section
    const name = last?.split('.').slice(0, -1).join('.') || last;
    return [
        ...allSections.slice(0, -1)
    ].join(path.sep())
}

function getFilename(executable: GameExecutable) {
    const last = executable.name.split(/\\|\//).pop();
    // remove file extension if there was none, just return the last section
    return last;
}

function isValidPath(path: string) {
    const illegalChars = ['>', '<', ':', '"', '|', '?', '*'];
    return illegalChars.some(char => path.includes(char));
}

function handleLaunch(executable: GameExecutable) {
    // Handle the launch logic here
    console.log('Launching game:', props.game);
    if(executable.is_running) {
        emit('stop', {
            game: props.game,
            executable: {
                path: getExecutablePath(executable),
                segments: splitExecutableName(executable).length,
                filename: getFilename(executable),
                ...executable
            },
        });
    } else {
        if (!gameActions?.isGameExecutableInstalled(executable)) {
            emit('install_and_play', {
                game: props.game,
                executable: {
                    path: getExecutablePath(executable),
                    segments: splitExecutableName(executable).length,
                    filename: getFilename(executable),
                    ...executable
                },
            });
        } else {
            emit('play', {
                game: props.game,
                executable: {
                    path: getExecutablePath(executable),
                    segments: splitExecutableName(executable).length,
                    filename: getFilename(executable),
                    ...executable
                },
            });
        }
     
    }
    
}

</script>

<style scoped>
.fade-right {
    -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
    mask-image: linear-gradient(to right, black 85%, transparent 100%);
}

.scrollbar-none {
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.scrollbar-none::-webkit-scrollbar {
    display: none;
}
</style>