<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const isOpen = ref(false);

function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (e.key === '?' && !isTyping) {
        e.preventDefault();
        isOpen.value = true;
    } else if (e.key === 'Escape' && isOpen.value) {
        isOpen.value = false;
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
});

defineExpose({ isOpen });
</script>

<template>
    <div v-if="isOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs"
        @click.self="isOpen = false">
        <div class="bg-slate-900/70 backdrop-blur-xl border border-cyan-900 rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-white flex items-center gap-2">
                    <span class="text-cyan-500">⌨</span> Keyboard shortcuts
                </h3>
                <button @click="isOpen = false" class="text-gray-500 hover:text-gray-300 text-sm">✕</button>
            </div>
            <div class="space-y-1 text-sm">
                <div class="flex items-center justify-between py-1.5 border-b border-cyan-900/30">
                    <span class="text-gray-400">Show this help</span>
                    <kbd class="text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-900 rounded px-2 py-0.5">?</kbd>
                </div>
                <div class="flex items-center justify-between py-1.5 border-b border-cyan-900/30">
                    <span class="text-gray-400">Close dialog / overlay</span>
                    <kbd class="text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-900 rounded px-2 py-0.5">Esc</kbd>
                </div>
                <div class="flex items-center justify-between py-1.5">
                    <span class="text-gray-400">Toggle list density</span>
                    <kbd class="text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-900 rounded px-2 py-0.5">click density icon</kbd>
                </div>
            </div>
        </div>
    </div>
</template>
