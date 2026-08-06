<script setup lang="ts">
import { ref } from 'vue';

const isVisible = ref(false);
const message = ref('');
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let onUndoCallback: (() => void) | null = null;

function show(text: string, onUndo: () => void, duration = 5000) {
    message.value = text;
    onUndoCallback = onUndo;
    isVisible.value = true;

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        isVisible.value = false;
        onUndoCallback = null;
    }, duration);
}

function handleUndo() {
    if (onUndoCallback) {
        onUndoCallback();
    }
    isVisible.value = false;
    if (timeoutId) clearTimeout(timeoutId);
    onUndoCallback = null;
}

function dismiss() {
    isVisible.value = false;
    if (timeoutId) clearTimeout(timeoutId);
    onUndoCallback = null;
}

defineExpose({ show });
</script>

<template>
    <Transition
        enter-active-class="transition-all duration-200 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
    >
        <div v-if="isVisible"
            class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-slate-900/70 backdrop-blur-xl border border-cyan-900 rounded-lg shadow-xl px-4 py-2.5 flex items-center gap-4">
            <span class="text-sm text-white">{{ message }}</span>
            <button @click="handleUndo" class="text-sm font-semibold text-cyan-400 hover:text-cyan-300">Undo</button>
            <button @click="dismiss" class="text-gray-500 hover:text-gray-300 text-xs">✕</button>
        </div>
    </Transition>
</template>
