<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, useTemplateRef } from 'vue';
import { Pages, useGlobalState } from '@/composables/app-state';
import { useUserPrefs } from '@/composables/user-prefs';

const { setPage } = useGlobalState();
const { toggleDensity, toggleNotifications } = useUserPrefs();

const isOpen = ref(false);
const query = ref('');
const inputRef = useTemplateRef<HTMLInputElement>('inputRef');

interface Command {
    label: string;
    hint?: string;
    action: () => void;
}

const commands: Command[] = [
    {
        label: 'Go to Home',
        hint: 'Navigation',
        action: () => setPage(Pages.HOME),
    },
    {
        label: 'Go to Playground',
        hint: 'Navigation',
        action: () => setPage(Pages.PLAYGROUND),
    },
    {
        label: 'Go to Settings',
        hint: 'Navigation',
        action: () => setPage(Pages.SETTINGS),
    },
    {
        label: 'Go to Favorites',
        hint: 'Navigation',
        action: () => setPage(Pages.FAVORITES),
    },
    {
        label: 'Search games',
        hint: 'Focus the search bar',
        action: () => {
            setPage(Pages.HOME);
            nextTick(() => {
                window.dispatchEvent(new CustomEvent('dqc:focus-search'));
            });
        },
    },
    {
        label: 'Toggle list density',
        hint: 'Compact / Comfortable',
        action: () => toggleDensity(),
    },
    {
        label: 'Toggle notifications',
        hint: 'Enable / disable toasts',
        action: () => toggleNotifications(),
    },
];

const filteredCommands = computed(() => {
    if (!query.value.trim()) return commands;
    const q = query.value.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(q));
});

const activeIndex = ref(0);

function open() {
    isOpen.value = true;
    query.value = '';
    activeIndex.value = 0;
    nextTick(() => inputRef.value?.focus());
}

function close() {
    isOpen.value = false;
}

function runActive() {
    const cmd = filteredCommands.value[activeIndex.value];
    if (cmd) {
        cmd.action();
        close();
    }
}

function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen.value) {
            close();
        } else {
            open();
        }
    } else if (e.key === 'Escape' && isOpen.value) {
        close();
    }
}

function handlePaletteKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex.value = Math.min(activeIndex.value + 1, filteredCommands.value.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex.value = Math.max(activeIndex.value - 1, 0);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        runActive();
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('dqc:open-palette', open);
});
onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeydown);
    window.removeEventListener('dqc:open-palette', open);
});
</script>

<template>
    <div v-if="isOpen" class="fixed inset-0 z-[105] flex items-start justify-center pt-24 bg-black/70 backdrop-blur-xs"
        @click.self="close">
        <div class="bg-deck-850/95 backdrop-blur-xl border border-line rounded-[10px] shadow-[0_28px_64px_-14px_rgba(0,0,0,0.85)] w-full max-w-md mx-4 overflow-hidden font-sans">
            <div class="flex items-center gap-2 px-3.5 py-3 border-b border-line">
                <svg class="h-3.5 w-3.5 text-ink-faint shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m9 18 6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <input ref="inputRef" v-model="query" @keydown="handlePaletteKeydown"
                    type="text" placeholder="Type a command or search..."
                    class="flex-1 bg-transparent text-[12.5px] text-ink placeholder-ink-faint outline-none" />
                <kbd class="font-mono text-[9.5px] text-ink-faint border border-line bg-deck-900 rounded px-1 py-px">Esc</kbd>
            </div>
            <div class="max-h-72 overflow-y-auto p-1.5">
                <div v-if="filteredCommands.length === 0" class="text-[11.5px] text-ink-faint text-center py-6">
                    No matching commands
                </div>
                <div v-for="(cmd, i) in filteredCommands" :key="cmd.label"
                    class="relative flex items-center justify-between px-3 py-2 rounded-[6px] cursor-pointer text-[12.5px]"
                    :class="i === activeIndex ? 'bg-signal/[0.09] text-ink' : 'text-ink-dim hover:bg-deck-700/50'"
                    @mouseenter="activeIndex = i"
                    @click="cmd.action(); close();"
                >
                    <span v-if="i === activeIndex" class="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-signal"></span>
                    <span>{{ cmd.label }}</span>
                    <span v-if="cmd.hint" class="font-mono text-[9.5px] text-ink-faint">{{ cmd.hint }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
