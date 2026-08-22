<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUpdater } from '@/composables/use-updater';

const { 
    updateAvailable, latestVersion, releaseNotes, releaseDate, 
    checkForUpdate, dismissUpdate,
    isDownloading, downloadProgress, installError, installUpdate,
} = useUpdater();
const showChangelog = ref(false);

onMounted(() => {
    // Check once on launch. Silent failure is fine here — if the check errors
    // (e.g. offline), we just don't show a banner rather than interrupting the user.
    checkForUpdate();
});

function formatDate(dateStr: string | null) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}
</script>

<template>
    <div v-if="updateAvailable" class="px-4 pt-3">
        <div class="flex items-center gap-3 bg-signal/[0.07] backdrop-blur-md border border-signal/30 rounded-[7px] px-3.5 py-2">
            <svg class="h-4 w-4 text-signal flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="text-[12px] text-ink flex-1">
                Version <strong class="font-mono text-signal">{{ latestVersion }}</strong> is available
            </span>
            <button @click="showChangelog = true"
                class="font-display uppercase tracking-[0.14em] text-[9.5px] text-signal hover:text-signal/80">
                View
            </button>
            <button @click="dismissUpdate" class="text-ink-faint hover:text-ink text-xs">✕</button>
        </div>
    </div>

    <div v-if="showChangelog" class="fixed inset-0 z-[108] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        @click.self="!isDownloading && (showChangelog = false)">
        <div class="bg-deck-850/95 backdrop-blur-xl border border-line rounded-[10px] shadow-[0_28px_64px_-14px_rgba(0,0,0,0.85)] w-full max-w-md mx-4 p-5">
            <div class="flex items-center justify-between mb-1">
                <h3 class="eyebrow">What's new in v{{ latestVersion }}</h3>
                <button v-if="!isDownloading" @click="showChangelog = false" class="text-ink-faint hover:text-ink text-sm">✕</button>
            </div>
            <div v-if="releaseDate" class="font-mono text-[10px] text-ink-faint mb-4">{{ formatDate(releaseDate) }}</div>

            <div class="text-[12px] text-ink-dim whitespace-pre-line max-h-64 overflow-y-auto mb-5 leading-relaxed">
                {{ releaseNotes || 'No release notes provided for this version.' }}
            </div>

            <div v-if="isDownloading" class="mb-4">
                <div class="flex items-center justify-between font-mono text-[10.5px] text-ink-dim mb-1.5">
                    <span>Downloading update...</span>
                    <span class="text-signal">{{ downloadProgress }}%</span>
                </div>
                <div class="h-1.5 bg-deck-800 border border-line rounded-full overflow-hidden">
                    <div class="h-full bg-signal transition-all duration-200" :style="{ width: downloadProgress + '%' }"></div>
                </div>
            </div>

            <div v-if="installError" class="text-[11.5px] text-alert mb-4">
                Failed to install update: {{ installError }}
            </div>

            <div class="flex items-center justify-end gap-3">
                <button v-if="!isDownloading" @click="showChangelog = false"
                    class="font-display uppercase tracking-[0.14em] text-[10px] text-ink-dim hover:text-ink border border-line hover:border-ink-faint rounded-[6px] px-3.5 py-2 transition-colors">
                    Later
                </button>
                <button @click="installUpdate" :disabled="isDownloading"
                    class="bg-signal hover:bg-signal/85 disabled:opacity-60 disabled:cursor-not-allowed text-deck-950 font-display uppercase tracking-[0.14em] text-[10px] px-4 py-2 rounded-[6px] transition-colors">
                    {{ isDownloading ? 'Installing...' : 'Install & Restart' }}
                </button>
            </div>
        </div>
    </div>
</template>
