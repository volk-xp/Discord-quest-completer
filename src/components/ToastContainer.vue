<script setup lang="ts">
import { useToasts } from '@/composables/use-toasts';

const { toasts, dismissToast } = useToasts();

const iconFor = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
};
const colorFor = {
    success: 'border-l-live text-live',
    error: 'border-l-alert text-alert',
    info: 'border-l-signal text-signal',
};
</script>

<template>
    <div class="fixed top-4 right-4 z-[95] flex flex-col gap-2 w-72">
        <TransitionGroup
            enter-active-class="transition-all duration-200 ease-out"
            leave-active-class="transition-all duration-200 ease-in absolute"
            enter-from-class="opacity-0 translate-x-4"
            enter-to-class="opacity-100 translate-x-0"
            leave-from-class="opacity-100 translate-x-0"
            leave-to-class="opacity-0 translate-x-4"
        >
            <div v-for="toast in toasts" :key="toast.id"
                class="bg-deck-850/85 backdrop-blur-xl border border-line rounded-[8px] shadow-[0_14px_34px_-10px_rgba(0,0,0,0.8)] px-3 py-2.5 flex items-center gap-2 border-l-2"
                :class="colorFor[toast.type]">
                <span class="text-sm">{{ iconFor[toast.type] }}</span>
                <span class="text-[11.5px] text-ink flex-1">{{ toast.message }}</span>
                <button @click="dismissToast(toast.id)" class="text-ink-faint hover:text-ink text-xs">✕</button>
            </div>
        </TransitionGroup>
    </div>
</template>
