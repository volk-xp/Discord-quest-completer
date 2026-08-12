import { ref } from 'vue';

// Module-level singleton so RPC connection state is visible from anywhere
// in the app (e.g. the sidebar), not just the Home page where the actual
// connect/disconnect logic runs.
const isConnectedToRPC = ref(false);
const isConnecting = ref(false);
const sessionElapsed = ref('00:00:00');

export function useRpcState() {
    return {
        isConnectedToRPC,
        isConnecting,
        sessionElapsed,
    };
}
