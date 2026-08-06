import { ref, watch } from 'vue';

export interface HistoryEntry {
    id: string;
    gameName: string;
    action: 'launched' | 'stopped' | 'rpc_connected' | 'rpc_disconnected';
    timestamp: number;
}

const HISTORY_KEY = 'dqc:history';
const MAX_ENTRIES = 50;

function loadHistory(): HistoryEntry[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as HistoryEntry[];
    } catch {
        return [];
    }
}

const history = ref<HistoryEntry[]>(loadHistory());

watch(history, (val) => {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(val));
    } catch {
        // ignore write errors
    }
}, { deep: true });

function addHistoryEntry(gameName: string, action: HistoryEntry['action']) {
    history.value.unshift({
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        gameName,
        action,
        timestamp: Date.now(),
    });
    if (history.value.length > MAX_ENTRIES) {
        history.value = history.value.slice(0, MAX_ENTRIES);
    }
}

function clearHistory() {
    history.value = [];
}

function formatRelativeTime(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
}

export function useHistory() {
    return {
        history,
        addHistoryEntry,
        clearHistory,
        formatRelativeTime,
    };
}
