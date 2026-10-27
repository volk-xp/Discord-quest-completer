import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { computed, effectScope, ref } from 'vue';
import { catalog } from './catalog-loader.mjs';

const source = fs.readFileSync(new URL('../src/composables/use-play-sessions.ts', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../src/pages/HomeView.vue', import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
export const flush = () => new Promise(resolve => setImmediate(resolve));

export function fixture({ addHistoryEntry, pushToast = () => {} } = {}) {
    let clock = 0, nextId = 0, nextTimer = 0, cleanup;
    const executable = { name: 'bin/game.exe', os: 'win32', is_launcher: false };
    const game = { id: '123', uid: 'fixture', name: 'Fixture', executables: [executable] };
    const gameList = ref([game]);
    const calls = [], history = [], logs = [], removedListeners = [];
    const native = new Map(), paths = new Map(), timers = new Map();
    const invoke = async (command, payload) => {
        calls.push({ command, payload });
        if (command === 'run_background_process') {
            const key = `${payload.app_id}\0${payload.executable_name.replace(/\\/g, '/').toLowerCase()}`;
            let id = paths.get(key);
            if (!native.has(id)) {
                id = `launch-${++nextId}`;
                paths.set(key, id);
                native.set(id, { launch_id: id, started_at: clock, ends_at: clock + 16 * 60 * 1000 });
            }
            return id;
        }
        if (command === 'running_processes') return [...native.values()];
        if (command === 'stop_process') native.delete(payload.launch_id);
    };
    const context = vm.createContext({
        ref, computed, Date: { now: () => clock }, invoke,
        gamePathPayload: catalog.gamePathPayload,
        useGameList: () => ({ gameList }),
        useGlobalState: () => ({ addLog: (...args) => logs.push(args) }),
        useHistory: () => ({ addHistoryEntry: addHistoryEntry ?? ((...args) => history.push(args)) }),
        useToasts: () => ({ pushToast }),
        useUserPrefs: () => ({ notificationsEnabled: ref(true) }),
        setInterval: callback => { timers.set(++nextTimer, callback); return nextTimer; },
        clearInterval: id => timers.delete(id),
        onUnmounted: callback => { cleanup = callback; },
        sessionTimerInterval: null,
        window: { removeEventListener: name => removedListeners.push(name) },
        handleFocusSearchEvent() {}, handleSelectFavoriteGame() {},
    });
    vm.runInContext(transpile(source.replace(/^import .*$/gm, '').replace(/^export /gm, '')), context);
    const cleanupSource = home.slice(home.indexOf('onUnmounted(() => {'), home.indexOf('// Selected games list'));
    vm.runInContext(transpile(cleanupSource), context);
    const scope = effectScope();
    const api = scope.run(() => context.usePlaySessions());
    return {
        api, context, game, executable, gameList, calls, native, history, logs, timers, removedListeners,
        invoke, consumer: () => context.usePlaySessions(),
        start: async () => { const session = await api.startPlaySession({ game, executable }); await flush(); return session; },
        sync: () => context.syncExitedProcesses(),
        setClock: value => { clock = value; },
        tick: async value => { if (value !== undefined) clock = value; for (const callback of [...timers.values()]) callback(); await flush(); },
        unmount: () => { scope.stop(); cleanup(); },
    };
}
