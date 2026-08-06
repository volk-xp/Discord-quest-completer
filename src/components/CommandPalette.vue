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
});
onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
    <div v-if="isOpen" class="fixed inset-0 z-[105] flex items-start justify-center pt-24 bg-black/70 backdrop-blur-xs"
        @click.self="close">
        <div class="bg-slate-900/70 backdrop-blur-xl border border-cyan-900 rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-cyan-900/50">
                <span class="text-cyan-500 text-sm">⌘</span>
                <input ref="inputRef" v-model="query" @keydown="handlePaletteKeydown"
                    type="text" placeholder="Type a command or search..."
                    class="flex-1 bg-transparent text-sm text-white placeholder-cyan-300/40 outline-none" />
                <kbd class="text-[10px] text-cyan-300/60 border border-cyan-900 rounded px-1">Esc</kbd>
            </div>
            <div class="max-h-72 overflow-y-auto p-1.5">
                <div v-if="filteredCommands.length === 0" class="text-xs text-gray-500 text-center py-6">
                    No matching commands
                </div>
                <div v-for="(cmd, i) in filteredCommands" :key="cmd.label"
                    class="flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm"
                    :class="i === activeIndex ? 'bg-cyan-950/60 text-white' : 'text-cyan-100/80 hover:bg-cyan-950/30'"
                    @mouseenter="activeIndex = i"
                    @click="cmd.action(); close();"
                >
                    <span>{{ cmd.label }}</span>
                    <span v-if="cmd.hint" class="text-[10px] text-cyan-300/50">{{ cmd.hint }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
