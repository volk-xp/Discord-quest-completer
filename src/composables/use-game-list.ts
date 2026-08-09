import { ref } from 'vue';
import type { Game } from '@/types/types';

// Module-level singleton so gameList stays in sync across every component
// that imports this composable (e.g. HomeView and FavoritesView), the same
// pattern used by user-prefs.ts.
const gameList = ref<Game[]>([]);

export function useGameList() {
    return {
        gameList,
    };
}
