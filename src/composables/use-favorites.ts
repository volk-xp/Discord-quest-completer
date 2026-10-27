import { computed, ref, watch } from 'vue';
import type { Game } from '@/types/types';
import { parseGameCatalog } from '@/utils/game-catalog';

const FAVORITES_KEY = 'dqc:favorite-games';
let rawFavoritesForRecovery: string | null = null;

interface FavoriteStore {
    version: 2;
    favorites: { id: string }[];
    catalog: Game[];
}

function snapshot(games: Game[]): FavoriteStore {
    const clean = [...new Map(parseGameCatalog(games).map(game => [game.id, game])).values()];
    return {
        version: 2,
        favorites: clean.map(game => ({ id: game.id })),
        catalog: clean,
    };
}

function restore(store: FavoriteStore): Game[] {
    const catalog = new Map(parseGameCatalog(store.catalog).map(game => [game.id, game]));
    return parseGameCatalog(store.favorites.map(favorite => {
        const game = catalog.get(favorite.id);
        if (!game) throw new Error('Invalid favorite identifier.');
        return { ...game, uid: game.id };
    }), true);
}

function loadFavorites(): FavoriteStore {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (raw === null) return snapshot([]);
        rawFavoritesForRecovery = raw;
        const saved = JSON.parse(raw);
        let invalid = false;
        const recoverCatalog = (entries: unknown): Game[] => {
            if (!Array.isArray(entries)) throw new Error('Invalid favorites catalog.');
            return entries.flatMap(entry => {
                try {
                    return parseGameCatalog([entry]);
                } catch {
                    invalid = true;
                    return [];
                }
            });
        };
        let games: Game[];
        // Migrate old full-game saves without restoring their runtime flags.
        if (Array.isArray(saved)) {
            games = recoverCatalog(saved);
        } else {
            if (![1, 2].includes(saved?.version) || !Array.isArray(saved.favorites)) throw new Error('Invalid favorites.');
            const catalog = new Map(recoverCatalog(saved.catalog).map(game => [game.id, game]));
            games = saved.favorites.flatMap((favorite: unknown) => {
                const game = favorite && typeof favorite === 'object' && 'id' in favorite
                    && typeof favorite.id === 'string' ? catalog.get(favorite.id) : undefined;
                if (game) return [game];
                invalid = true;
                return [];
            });
        }
        const store = snapshot(games);
        if (!invalid) rawFavoritesForRecovery = null;
        return store;
    } catch {
        return snapshot([]);
    }
}

// Preferences and catalog metadata survive restarts; runtime objects do not.
const savedFavorites = ref<FavoriteStore>(loadFavorites());
const favoriteGames = computed(() => restore(savedFavorites.value));

watch(savedFavorites, (val) => {
    try {
        // Preserve damaged saves before an explicit edit replaces recovered data.
        if (rawFavoritesForRecovery !== null) {
            localStorage.setItem(`${FAVORITES_KEY}:recovery`, rawFavoritesForRecovery);
        }
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(val));
        rawFavoritesForRecovery = null;
    } catch {
        // ignore write errors (e.g. storage disabled)
    }
}, { immediate: rawFavoritesForRecovery === null && savedFavorites.value.favorites.length > 0 });

export function useFavorites() {
    function isFavorite(id: string | undefined | null): boolean {
        if (!id) return false;
        return savedFavorites.value.favorites.some(game => game.id === id);
    }

    function toggleFavorite(game: Game) {
        if (!game?.id) return;
        const exists = isFavorite(game.id);
        if (exists) {
            removeFavorite(game.id);
        } else {
            savedFavorites.value = snapshot([...favoriteGames.value, game]);
        }
    }

    function removeFavorite(id: string | undefined | null) {
        if (!id) return;
        savedFavorites.value = snapshot(favoriteGames.value.filter(g => g.id !== id));
    }

    return {
        favoriteGames,
        isFavorite,
        toggleFavorite,
        removeFavorite,
    };
}
