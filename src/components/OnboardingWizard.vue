<script setup lang="ts">
import { ref } from 'vue';
import { useUserPrefs } from '@/composables/user-prefs';

const { hasOnboarded, completeOnboarding } = useUserPrefs();
const step = ref(0);
const totalSteps = 3;

function next() {
    if (step.value < totalSteps - 1) {
        step.value++;
    } else {
        finish();
    }
}

function finish() {
    completeOnboarding();
}
</script>

<template>
    <div v-if="!hasOnboarded" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div class="bg-slate-900/70 backdrop-blur-xl border border-cyan-900 rounded-lg shadow-2xl w-full max-w-md mx-4 p-8 text-center">
            <div class="flex justify-center gap-1.5 mb-6">
                <div v-for="i in totalSteps" :key="i" class="h-1 rounded-full transition-all"
                    :class="i - 1 === step ? 'w-6 bg-cyan-500' : 'w-6 bg-cyan-950'"></div>
            </div>

            <template v-if="step === 0">
                <div class="w-14 h-14 rounded-2xl bg-cyan-950 mx-auto mb-4 flex items-center justify-center">
                    <span class="text-2xl">🔥</span>
                </div>
                <h2 class="text-lg font-semibold text-white mb-2">Welcome to Discord Quest Completer</h2>
                <p class="text-sm text-cyan-300/70 leading-relaxed">
                    Simulate playing Discord-verified games and complete quests without downloading massive game files.
                </p>
            </template>

            <template v-else-if="step === 1">
                <div class="w-14 h-14 rounded-2xl bg-cyan-950 mx-auto mb-4 flex items-center justify-center">
                    <span class="text-2xl">⚠️</span>
                </div>
                <h2 class="text-lg font-semibold text-white mb-2">A quick note</h2>
                <p class="text-sm text-cyan-300/70 leading-relaxed">
                    This tool is intended for educational and personal use. Please respect Discord's Terms of Service.
                    Use at your own risk.
                </p>
            </template>

            <template v-else>
                <div class="w-14 h-14 rounded-2xl bg-cyan-950 mx-auto mb-4 flex items-center justify-center">
                    <span class="text-2xl">🎮</span>
                </div>
                <h2 class="text-lg font-semibold text-white mb-2">You're all set</h2>
                <p class="text-sm text-cyan-300/70 leading-relaxed">
                    Search for a Discord-verified game above and add it to your list to get started.
                    Press <kbd class="text-xs border border-cyan-900 rounded px-1">?</kbd> anytime for shortcuts.
                </p>
            </template>

            <div class="flex items-center justify-between mt-7">
                <button @click="finish" class="text-xs text-cyan-500/70 hover:text-cyan-400">Skip</button>
                <button @click="next"
                    class="bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium px-5 py-2 rounded-lg">
                    {{ step === totalSteps - 1 ? 'Get started' : 'Next' }}
                </button>
            </div>
        </div>
    </div>
</template>
