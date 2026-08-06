import { ref, watch } from 'vue';

// Simple localStorage-backed preferences. This persists across app restarts
// since Tauri's webview retains localStorage in its own user-data folder.

const FAVORITES_KEY = 'dqc:favorites';
const DENSITY_KEY = 'dqc:density';
const ONBOARDED_KEY = 'dqc:onboarded';
const NOTIFICATIONS_KEY = 'dqc:notifications-enabled';

function loadFavorites(): Set<string> {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw) as string[];
        return new Set(arr);
    } catch {
        return new Set();
    }
}

function loadDensity(): 'comfortable' | 'compact' {
    try {
        const raw = localStorage.getItem(DENSITY_KEY);
        return raw === 'compact' ? 'compact' : 'comfortable';
    } catch {
        return 'comfortable';
    }
}

function loadOnboarded(): boolean {
    try {
        return localStorage.getItem(ONBOARDED_KEY) === 'true';
    } catch {
        return false;
    }
}

function loadNotificationsEnabled(): boolean {
    try {
        const raw = localStorage.getItem(NOTIFICATIONS_KEY);
        // default to enabled if never set
        return raw === null ? true : raw === 'true';
    } catch {
        return true;
    }
}

const favorites = ref<Set<string>>(loadFavorites());
const density = ref<'comfortable' | 'compact'>(loadDensity());
const hasOnboarded = ref<boolean>(loadOnboarded());
const notificationsEnabled = ref<boolean>(loadNotificationsEnabled());

watch(hasOnboarded, (val) => {
    try {
        localStorage.setItem(ONBOARDED_KEY, String(val));
    } catch {
        // ignore
    }
});

watch(notificationsEnabled, (val) => {
    try {
        localStorage.setItem(NOTIFICATIONS_KEY, String(val));
    } catch {
        // ignore
    }
});

watch(favorites, (val) => {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(val)));
    } catch {
        // ignore write errors (e.g. storage disabled)
    }
}, { deep: true });

watch(density, (val) => {
    try {
        localStorage.setItem(DENSITY_KEY, val);
    } catch {
        // ignore write errors
    }
});

export function useUserPrefs() {
    function isFavorite(gameUid: string | undefined | null) {
        if (!gameUid) return false;
        return favorites.value.has(gameUid);
    }

    function toggleFavorite(gameUid: string | undefined | null) {
        if (!gameUid) return;
        const next = new Set(favorites.value);
        if (next.has(gameUid)) {
            next.delete(gameUid);
        } else {
            next.add(gameUid);
        }
        favorites.value = next;
    }

    function toggleDensity() {
        density.value = density.value === 'comfortable' ? 'compact' : 'comfortable';
    }

    function completeOnboarding() {
        hasOnboarded.value = true;
    }

    function toggleNotifications() {
        notificationsEnabled.value = !notificationsEnabled.value;
    }

    return {
        favorites,
        density,
        isFavorite,
        toggleFavorite,
        toggleDensity,
        hasOnboarded,
        completeOnboarding,
        notificationsEnabled,
        toggleNotifications,
    };
}
