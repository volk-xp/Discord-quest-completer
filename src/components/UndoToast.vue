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
            class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-deck-850/90 backdrop-blur-xl border border-line rounded-[8px] shadow-[0_18px_44px_-12px_rgba(0,0,0,0.85)] px-4 py-2.5 flex items-center gap-4">
            <span class="text-[12px] text-ink">{{ message }}</span>
            <button @click="handleUndo" class="font-display uppercase tracking-[0.14em] text-[9.5px] text-signal hover:text-signal/80">Undo</button>
            <button @click="dismiss" class="text-ink-faint hover:text-ink text-xs">✕</button>
        </div>
    </Transition>
</template>
