import { ref, watch } from 'vue';
import type { Game } from '@/types/types';

const FAVORITES_KEY = 'dqc:favorite-games';

function loadFavorites(): Game[] {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as Game[];
    } catch {
        return [];
    }
}

// Module-level singleton, persisted to localStorage. This holds full game
// objects (not just IDs) so a favorite survives regardless of what's
// currently in Home's temporary session list, and regardless of app restarts.
const favoriteGames = ref<Game[]>(loadFavorites());

watch(favoriteGames, (val) => {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(val));
    } catch {
        // ignore write errors (e.g. storage disabled)
    }
}, { deep: true });

export function useFavorites() {
    function isFavorite(uid: string | undefined | null): boolean {
        if (!uid) return false;
        return favoriteGames.value.some(g => g.uid === uid);
    }

    function toggleFavorite(game: Game) {
        if (!game?.uid) return;
        const exists = favoriteGames.value.some(g => g.uid === game.uid);
        if (exists) {
            favoriteGames.value = favoriteGames.value.filter(g => g.uid !== game.uid);
        } else {
            favoriteGames.value = [...favoriteGames.value, { ...game }];
        }
    }

    function removeFavorite(uid: string | undefined | null) {
        if (!uid) return;
        favoriteGames.value = favoriteGames.value.filter(g => g.uid !== uid);
    }

    return {
        favoriteGames,
        isFavorite,
        toggleFavorite,
        removeFavorite,
    };
}
