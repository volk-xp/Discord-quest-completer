<script setup lang="ts">
import { useUserPrefs } from '@/composables/user-prefs';
import { useHistory } from '@/composables/use-history';

const { density, toggleDensity, notificationsEnabled, toggleNotifications, hasOnboarded, completeOnboarding } = useUserPrefs();
const { history, clearHistory, formatRelativeTime } = useHistory();

function resetOnboarding() {
    hasOnboarded.value = false;
}
</script>

<template>
    <div class="container mx-auto px-4 py-8 max-w-2xl">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

        <div class="bg-white/85 dark:bg-slate-900/40 backdrop-blur-md border border-transparent dark:border-cyan-900/40 rounded-lg p-5 mb-5">
            <div class="text-xs text-gray-500 dark:text-cyan-300/70 uppercase tracking-wide mb-3">General</div>

            <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-cyan-900/30">
                <div>
                    <div class="text-sm text-gray-900 dark:text-white">Toast notifications</div>
                    <div class="text-xs text-gray-500 dark:text-cyan-300/50">Show pop-up notifications for events like game launches and RPC connections</div>
                </div>
                <button @click="toggleNotifications"
                    class="w-10 h-5 rounded-full relative transition-colors flex-shrink-0"
                    :class="notificationsEnabled ? 'bg-cyan-600' : 'bg-gray-300 dark:bg-cyan-950'">
                    <span class="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                        :class="notificationsEnabled ? 'right-0.5' : 'left-0.5'"></span>
                </button>
            </div>

            <div class="flex items-center justify-between py-3">
                <div>
                    <div class="text-sm text-gray-900 dark:text-white">Compact list view</div>
                    <div class="text-xs text-gray-500 dark:text-cyan-300/50">Tighter spacing in the games list</div>
                </div>
                <button @click="toggleDensity"
                    class="w-10 h-5 rounded-full relative transition-colors flex-shrink-0"
                    :class="density === 'compact' ? 'bg-cyan-600' : 'bg-gray-300 dark:bg-cyan-950'">
                    <span class="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                        :class="density === 'compact' ? 'right-0.5' : 'left-0.5'"></span>
                </button>
            </div>
        </div>

        <div class="bg-white/85 dark:bg-slate-900/40 backdrop-blur-md border border-transparent dark:border-cyan-900/40 rounded-lg p-5 mb-5">
            <div class="flex items-center justify-between mb-3">
                <div class="text-xs text-gray-500 dark:text-cyan-300/70 uppercase tracking-wide">Play history</div>
                <button v-if="history.length > 0" @click="clearHistory"
                    class="text-xs text-red-500 hover:text-red-400">Clear</button>
            </div>
            <div v-if="history.length === 0" class="text-xs text-gray-500 dark:text-gray-400 py-2">
                No sessions logged yet.
            </div>
            <div v-else class="space-y-1 max-h-56 overflow-y-auto">
                <div v-for="entry in history" :key="entry.id"
                    class="flex items-center justify-between text-xs py-1.5 border-b border-gray-100 dark:border-cyan-900/20 last:border-b-0">
                    <span class="text-gray-700 dark:text-gray-300">
                        <span class="text-gray-400 dark:text-cyan-300/50">
                            {{ entry.action === 'launched' ? '▶' : entry.action === 'stopped' ? '■' : entry.action === 'rpc_connected' ? '●' : '○' }}
                        </span>
                        {{ entry.gameName }}
                        <span class="text-gray-400 dark:text-gray-500">— {{ entry.action.replace('_', ' ') }}</span>
                    </span>
                    <span class="text-gray-400 dark:text-gray-500">{{ formatRelativeTime(entry.timestamp) }}</span>
                </div>
            </div>
        </div>

        <div class="bg-white/85 dark:bg-slate-900/40 backdrop-blur-md border border-transparent dark:border-cyan-900/40 rounded-lg p-5 mb-5">
            <div class="text-xs text-gray-500 dark:text-cyan-300/70 uppercase tracking-wide mb-3">Help</div>
            <button @click="resetOnboarding"
                class="text-sm text-cyan-500 hover:text-cyan-400">
                Replay welcome guide
            </button>
        </div>

        <div class="bg-gray-50 dark:bg-slate-900/50 border border-dashed border-gray-200 dark:border-cyan-900/30 rounded-lg p-5 text-xs text-gray-500 dark:text-gray-500">
            <div class="font-medium mb-1">Coming soon</div>
            "Launch on startup" and "Minimize to tray" require additional native OS integration
            that hasn't been wired up yet in this build.
        </div>
    </div>
</template>
