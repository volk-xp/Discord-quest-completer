<script setup lang="ts">
import { useFavorites } from '@/composables/use-favorites';
import { Pages, useGlobalState } from '@/composables/app-state';
import type { Game } from '@/types/types';

const { favoriteGames, removeFavorite } = useFavorites();
const { setPage } = useGlobalState();

function playFavorite(game: Game) {
    setPage(Pages.HOME);
    // HomeView listens for this and selects the matching game (adding it
    // back to its session list first if needed) — the existing, already
    // working launch flow (executable picker, RPC, etc.) handles the rest.
    window.dispatchEvent(new CustomEvent('dqc:select-game', { detail: game }));
}
</script>

<template>
    <div class="container mx-auto px-4 py-8 max-w-2xl">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <span class="text-amber-400 text-2xl">★</span> Favorites
        </h1>

        <div v-if="favoriteGames.length === 0" class="text-center py-16">
            <div class="text-3xl mb-2 opacity-50">☆</div>
            <div class="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1">No favorites yet</div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">
                Star a game from the Home tab to pin it here for quick access. Favorites stay here permanently until you remove them.
            </div>
        </div>

        <div v-else class="space-y-3">
            <div v-for="game in favoriteGames" :key="game.uid"
                class="bg-white/85 dark:bg-slate-900/40 backdrop-blur-md border border-transparent dark:border-cyan-900/40 rounded-lg p-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <button @click="removeFavorite(game.uid)" class="text-2xl leading-none text-amber-400 hover:scale-110 transition-transform" title="Remove from favorites">
                        ★
                    </button>
                    <div class="font-medium text-gray-800 dark:text-white">{{ game.name }}</div>
                </div>
                <button @click="playFavorite(game)"
                    class="bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
                    Play
                </button>
            </div>
        </div>
    </div>
</template>
