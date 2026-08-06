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
    <div v-if="updateAvailable" class="px-4 pt-4">
        <div class="flex items-center gap-3 bg-cyan-950/40 backdrop-blur-md border border-cyan-900/60 rounded-lg px-4 py-2.5">
            <svg class="h-4 w-4 text-cyan-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="text-sm text-white flex-1">
                Version <strong>{{ latestVersion }}</strong> is available
            </span>
            <button @click="showChangelog = true" class="text-xs font-medium text-cyan-400 hover:text-cyan-300">
                View
            </button>
            <button @click="dismissUpdate" class="text-gray-500 hover:text-gray-300 text-xs">✕</button>
        </div>
    </div>

    <div v-if="showChangelog" class="fixed inset-0 z-[108] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        @click.self="!isDownloading && (showChangelog = false)">
        <div class="bg-slate-900/90 backdrop-blur-xl border border-cyan-900 rounded-lg shadow-2xl w-full max-w-md mx-4 p-6">
            <div class="flex items-center justify-between mb-1">
                <h3 class="text-base font-semibold text-white">What's new in v{{ latestVersion }}</h3>
                <button v-if="!isDownloading" @click="showChangelog = false" class="text-gray-500 hover:text-gray-300 text-sm">✕</button>
            </div>
            <div v-if="releaseDate" class="text-xs text-cyan-300/60 mb-4">{{ formatDate(releaseDate) }}</div>

            <div class="text-sm text-gray-300 whitespace-pre-line max-h-64 overflow-y-auto mb-5 leading-relaxed">
                {{ releaseNotes || 'No release notes provided for this version.' }}
            </div>

            <div v-if="isDownloading" class="mb-4">
                <div class="flex items-center justify-between text-xs text-cyan-300/70 mb-1.5">
                    <span>Downloading update...</span>
                    <span>{{ downloadProgress }}%</span>
                </div>
                <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-cyan-500 transition-all duration-200" :style="{ width: downloadProgress + '%' }"></div>
                </div>
            </div>

            <div v-if="installError" class="text-xs text-red-400 mb-4">
                Failed to install update: {{ installError }}
            </div>

            <div class="flex items-center justify-end gap-3">
                <button v-if="!isDownloading" @click="showChangelog = false" class="text-sm text-gray-400 hover:text-gray-300">
                    Later
                </button>
                <button @click="installUpdate" :disabled="isDownloading"
                    class="bg-cyan-700 hover:bg-cyan-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg">
                    {{ isDownloading ? 'Installing...' : 'Install & Restart' }}
                </button>
            </div>
        </div>
    </div>
</template>
