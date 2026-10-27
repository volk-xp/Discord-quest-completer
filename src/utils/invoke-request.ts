import { invoke } from '@tauri-apps/api/core';

export interface RequestError {
    code: string;
    message: string;
    status?: number;
}

export function requestError(error: unknown): RequestError {
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        const value = error as Partial<RequestError>;
        return { code: typeof value.code === 'string' ? value.code : 'unknown', message: error.message,
            status: typeof value.status === 'number' ? value.status : undefined };
    }
    return { code: 'unknown', message: String(error) };
}

// The frontend deadline also covers IPC registration. The backend has its own
// shorter deadlines; aborting here explicitly cancels the native request.
export async function invokeRequest<T>(command: string, payload: Record<string, unknown> = {}, signal?: AbortSignal, ready?: Promise<unknown>): Promise<T> {
    let token: string | undefined;
    let completed = false;
    let failure: RequestError | undefined;
    let rejectAbort: (error: RequestError) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const cancelNative = () => {
        if (token) void invoke('cancel_request', { request_token: token }).catch(() => {});
    };
    const abort = (error: RequestError) => {
        failure ??= error;
        cancelNative();
        rejectAbort(failure);
    };
    const onAbort = () => abort({ code: 'cancelled', message: 'Request cancelled' });
    const timer = setTimeout(() => abort({ code: 'timeout', message: 'Request timed out' }), 35_000);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const work = async () => {
        if (failure) throw failure;
        if (ready) await ready;
        if (failure) throw failure;
        token = await invoke<string>('start_request');
        // A late registration still needs cancellation, even after Promise.race ended.
        if (failure) { cancelNative(); throw failure; }
        return invoke<T>(command, { ...payload, request_token: token });
    };
    try {
        const result = await Promise.race([work(), aborted]);
        completed = true;
        return result;
    } catch (error) {
        throw requestError(error);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (!completed) cancelNative();
    }
}
