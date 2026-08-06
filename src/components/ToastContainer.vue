<script setup lang="ts">
import { useToasts } from '@/composables/use-toasts';

const { toasts, dismissToast } = useToasts();

const iconFor = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
};
const colorFor = {
    success: 'border-l-green-500 text-green-400',
    error: 'border-l-red-500 text-red-400',
    info: 'border-l-amber-500 text-amber-400',
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
                class="bg-slate-900/75 backdrop-blur-xl border border-cyan-900/60 rounded-lg shadow-lg px-3 py-2.5 flex items-center gap-2 border-l-2"
                :class="colorFor[toast.type]">
                <span class="text-sm">{{ iconFor[toast.type] }}</span>
                <span class="text-xs text-white flex-1">{{ toast.message }}</span>
                <button @click="dismissToast(toast.id)" class="text-gray-500 hover:text-gray-300 text-xs">✕</button>
            </div>
        </TransitionGroup>
    </div>
</template>
