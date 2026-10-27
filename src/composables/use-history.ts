import { ref, watch } from 'vue';

export interface HistoryEntry {
    id: string;
    gameName: string;
    action: 'launched' | 'stopped' | 'rpc_connected' | 'rpc_disconnected';
    timestamp: number;
}

const HISTORY_KEY = 'dqc:history';
const MAX_ENTRIES = 50;

function isHistoryEntry(value: unknown): value is HistoryEntry {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<HistoryEntry>;
    return typeof entry.id === 'string'
        && typeof entry.gameName === 'string'
        && (entry.action === 'launched' || entry.action === 'stopped'
            || entry.action === 'rpc_connected' || entry.action === 'rpc_disconnected')
        && typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp)
        && entry.timestamp >= 0;
}

function loadHistory(): HistoryEntry[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).slice(0, MAX_ENTRIES) : [];
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
