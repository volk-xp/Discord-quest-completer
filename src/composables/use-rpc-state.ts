import { computed, onScopeDispose, ref } from 'vue';
import { invokeRequest, requestError, type RequestError } from '@/utils/invoke-request';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// Shared by Home, Playground and the sidebar. Only backend confirmation sets
// connected; request IDs keep late results/events from reviving an old attempt.
const isConnectedToRPC = ref(false);
const isConnecting = ref(false);
const isDisconnecting = ref(false);
const sessionElapsed = ref('00:00:00');
const rpcError = ref<string | null>(null);
let connectionAttempt: AbortController | null = null;
let activeRequestId: string | null = null;
let listening: Promise<UnlistenFn> | undefined;
let consumers = 0;
let disconnectedDuringStop: Set<string> | null = null;

function releaseListener() {
    if (--consumers > 0) return;
    const pending = listening;
    listening = undefined;
    activeRequestId = null;
    connectionAttempt?.abort();
    connectionAttempt = null;
    isConnecting.value = false;
    isConnectedToRPC.value = false;
    // Registration can finish after the last component has been disposed.
    void pending?.then(unlisten => unlisten(), () => {});
}

function ensureListener() {
    if (listening) return listening;
    const registration = listen<{ request_id: string; error: RequestError }>('client_disconnected', ({ payload }) => {
        if (listening !== registration) return;
        if (disconnectedDuringStop) {
            disconnectedDuringStop.add(payload.request_id);
            return;
        }
        if (payload.request_id !== activeRequestId) return;
        activeRequestId = null;
        isConnectedToRPC.value = false;
        isConnecting.value = false;
        rpcError.value = requestError(payload.error).message;
    }).catch(error => {
        if (listening === registration) listening = undefined;
        throw error;
    });
    return listening = registration;
}

async function connectRpc(activity: Record<string, unknown>): Promise<boolean> {
    if (isConnecting.value || isDisconnecting.value || isConnectedToRPC.value) return false;
    const requestId = crypto.randomUUID();
    activeRequestId = requestId;
    const controller = new AbortController();
    connectionAttempt = controller;
    isConnecting.value = true;
    rpcError.value = null;
    try {
        // Register before invoking: Discord can disconnect before IPC resolves.
        await invokeRequest('connect_to_discord_rpc_3', {
            activity_json: JSON.stringify(activity), action: 'connect', request_id: requestId,
        }, controller.signal, ensureListener());
        if (activeRequestId !== requestId) return false;
        isConnectedToRPC.value = true;
        return true;
    } catch (error) {
        if (activeRequestId === requestId) {
            activeRequestId = null;
            rpcError.value = requestError(error).message;
        }
        return false;
    } finally {
        if (connectionAttempt === controller) connectionAttempt = null;
        if (activeRequestId === requestId || activeRequestId === null) isConnecting.value = false;
    }
}

async function disconnectRpc(): Promise<boolean> {
    if (isDisconnecting.value) return false;
    activeRequestId = null;
    connectionAttempt?.abort();
    connectionAttempt = null;
    isConnecting.value = false;
    isDisconnecting.value = true;
    disconnectedDuringStop = new Set();
    rpcError.value = null;
    try {
        await invokeRequest('connect_to_discord_rpc_3', {
            activity_json: '{}', action: 'disconnect', request_id: '',
        });
        isConnectedToRPC.value = false;
        return true;
    } catch (error) {
        rpcError.value = requestError(error).message;
        try {
            const requestId = await invokeRequest<string | null>('rpc_connection_id');
            if (consumers > 0 && requestId !== null && !disconnectedDuringStop.has(requestId)) {
                activeRequestId = requestId;
            }
        } catch {
            // Without backend confirmation, keep the connection unconfirmed.
        }
        isConnectedToRPC.value = activeRequestId !== null;
        return false;
    } finally {
        disconnectedDuringStop = null;
        isDisconnecting.value = false;
    }
}

export function useRpcState() {
    consumers++;
    onScopeDispose(releaseListener);
    return {
        isConnectedToRPC: computed(() => isConnectedToRPC.value),
        isConnecting: computed(() => isConnecting.value),
        isDisconnecting: computed(() => isDisconnecting.value),
        rpcError: computed(() => rpcError.value),
        sessionElapsed,
        connectRpc,
        disconnectRpc,
    };
}
