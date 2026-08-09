import { ref, watch } from 'vue';

// Simple localStorage-backed preferences. This persists across app restarts
// since Tauri's webview retains localStorage in its own user-data folder.
//
// Note: favorites now live in their own dedicated composable, use-favorites.ts,
// since they need to store full game data (not just an ID) to stay independent
// of Home's session-only game list. See that file instead.

const DENSITY_KEY = 'dqc:density';
const ONBOARDED_KEY = 'dqc:onboarded';
const NOTIFICATIONS_KEY = 'dqc:notifications-enabled';

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

watch(density, (val) => {
    try {
        localStorage.setItem(DENSITY_KEY, val);
    } catch {
        // ignore write errors
    }
});

export function useUserPrefs() {
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
        density,
        toggleDensity,
        hasOnboarded,
        completeOnboarding,
        notificationsEnabled,
        toggleNotifications,
    };
}
