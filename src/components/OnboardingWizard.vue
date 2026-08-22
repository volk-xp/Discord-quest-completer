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
    <div v-if="!hasOnboarded" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm font-sans text-ink">
        <div class="bg-deck-850/95 backdrop-blur-xl border border-line rounded-[10px] shadow-[0_28px_64px_-14px_rgba(0,0,0,0.85)] w-full max-w-md mx-4 p-8 text-center">
            <div class="flex justify-center gap-1.5 mb-6">
                <div v-for="i in totalSteps" :key="i" class="h-[3px] rounded-full transition-all"
                    :class="i - 1 === step ? 'w-6 bg-signal' : 'w-6 bg-line'"></div>
            </div>

            <template v-if="step === 0">
                <div class="w-14 h-14 rounded-[10px] bg-deck-800 border border-line mx-auto mb-4 flex items-center justify-center">
                    <span class="text-2xl">🔥</span>
                </div>
                <h2 class="text-[15px] text-ink mb-2">Welcome to Discord Quest Completer</h2>
                <p class="text-[12px] text-ink-dim leading-relaxed">
                    Simulate playing Discord-verified games and complete quests without downloading massive game files.
                </p>
            </template>

            <template v-else-if="step === 1">
                <div class="w-14 h-14 rounded-[10px] bg-signal/[0.08] border border-signal/30 mx-auto mb-4 flex items-center justify-center">
                    <span class="text-2xl">⚠️</span>
                </div>
                <h2 class="text-[15px] text-ink mb-2">A quick note</h2>
                <p class="text-[12px] text-ink-dim leading-relaxed">
                    This tool is intended for educational and personal use. Please respect Discord's Terms of Service.
                    Use at your own risk.
                </p>
            </template>

            <template v-else>
                <div class="w-14 h-14 rounded-[10px] bg-deck-800 border border-line mx-auto mb-4 flex items-center justify-center">
                    <span class="text-2xl">🎮</span>
                </div>
                <h2 class="text-[15px] text-ink mb-2">You're all set</h2>
                <p class="text-[12px] text-ink-dim leading-relaxed">
                    Search for a Discord-verified game above and add it to your list to get started.
                    Press <kbd class="font-mono text-[10px] border border-line bg-deck-900 rounded px-1 py-px">?</kbd> anytime for shortcuts.
                </p>
            </template>

            <div class="flex items-center justify-between mt-7">
                <button @click="finish"
                    class="font-display uppercase tracking-[0.14em] text-[9.5px] text-ink-faint hover:text-ink">Skip</button>
                <button @click="next"
                    class="bg-signal hover:bg-signal/85 text-deck-950 font-display uppercase tracking-[0.14em] text-[10px] px-5 py-2 rounded-[6px] transition-colors">
                    {{ step === totalSteps - 1 ? 'Get started' : 'Next' }}
                </button>
            </div>
        </div>
    </div>
</template>
