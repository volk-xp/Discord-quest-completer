import { ref } from 'vue';

export interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

// Module-level singleton state so any file can push a toast without prop drilling
const toasts = ref<Toast[]>([]);
let idCounter = 0;

function pushToast(type: Toast['type'], message: string, duration = 4000) {
    const id = `toast-${Date.now()}-${idCounter++}`;
    toasts.value.push({ id, type, message });
    setTimeout(() => {
        dismissToast(id);
    }, duration);
}

function dismissToast(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id);
}

export function useToasts() {
    return {
        toasts,
        pushToast,
        dismissToast,
    };
}
