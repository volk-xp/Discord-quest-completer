import { ref, shallowRef } from 'vue';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const isChecking = ref(false);
const updateAvailable = ref(false);
const latestVersion = ref<string | null>(null);
const releaseNotes = ref<string | null>(null);
const releaseDate = ref<string | null>(null);
const checkError = ref<string | null>(null);

const isDownloading = ref(false);
const downloadProgress = ref(0); // 0-100
const installError = ref<string | null>(null);

// Holds the actual Update object returned by the plugin so Step 7 can call
// .downloadAndInstall() on it directly without re-checking.
const pendingUpdate = shallowRef<Update | null>(null);

async function checkForUpdate() {
    isChecking.value = true;
    checkError.value = null;
    try {
        const update = await check();
        if (update) {
            updateAvailable.value = true;
            latestVersion.value = update.version;
            releaseNotes.value = update.body ?? null;
            releaseDate.value = update.date ?? null;
            pendingUpdate.value = update;
        } else {
            updateAvailable.value = false;
            pendingUpdate.value = null;
        }
    } catch (err) {
        checkError.value = err instanceof Error ? err.message : String(err);
        updateAvailable.value = false;
    } finally {
        isChecking.value = false;
    }
}

function dismissUpdate() {
    updateAvailable.value = false;
}

async function installUpdate() {
    if (!pendingUpdate.value) return;

    isDownloading.value = true;
    downloadProgress.value = 0;
    installError.value = null;

    let totalBytes = 0;
    let downloadedBytes = 0;

    try {
        await pendingUpdate.value.downloadAndInstall((event) => {
            switch (event.event) {
                case 'Started':
                    totalBytes = event.data.contentLength ?? 0;
                    downloadedBytes = 0;
                    break;
                case 'Progress':
                    downloadedBytes += event.data.chunkLength;
                    if (totalBytes > 0) {
                        downloadProgress.value = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
                    }
                    break;
                case 'Finished':
                    downloadProgress.value = 100;
                    break;
            }
        });

        // Install succeeded — restart the app to load the new version.
        await relaunch();
    } catch (err) {
        installError.value = err instanceof Error ? err.message : String(err);
        isDownloading.value = false;
    }
}

export function useUpdater() {
    return {
        isChecking,
        updateAvailable,
        latestVersion,
        releaseNotes,
        releaseDate,
        checkError,
        pendingUpdate,
        checkForUpdate,
        dismissUpdate,
        isDownloading,
        downloadProgress,
        installError,
        installUpdate,
    };
}
