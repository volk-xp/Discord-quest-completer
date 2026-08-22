<script setup lang="ts">
import { Pages, useGlobalState } from '@/composables/app-state';
import { useGameList } from '@/composables/use-game-list';
import { useRpcState } from '@/composables/use-rpc-state';
import CommandPalette from './CommandPalette.vue';
import OnboardingWizard from './OnboardingWizard.vue';
import ToastContainer from './ToastContainer.vue';
import UpdateBanner from './UpdateBanner.vue';

// Layout component for consistent page structure

const appState = useGlobalState();
const { page, setPage } = appState;
const { gameList } = useGameList();
const { isConnectedToRPC } = useRpcState();

function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('dqc:open-palette'));
}

</script>

<template>
  <div class="flex h-dvh overflow-hidden font-sans text-ink">
    <!-- Sidebar nav rail. Icon-only at 74px so the game list beside it gets the
         width; every button keeps its title for the tooltip. -->
    <aside
      class="w-[74px] shrink-0 flex flex-col items-center py-4 bg-deck-950/55 backdrop-blur-xl border-r border-line/70">
      <img src="/logo.svg" alt="Discord Quest Completer" class="h-7 w-7" />

      <nav class="flex flex-col items-center gap-1.5 mt-5 w-full px-3">
        <button @click="setPage(Pages.HOME)" title="Home"
          class="relative w-full h-10 grid place-items-center rounded-[7px] transition-colors duration-150"
          :class="page === Pages.HOME ? 'bg-signal/10 text-signal' : 'text-ink-dim hover:text-ink hover:bg-deck-700/60'">
          <span v-if="page === Pages.HOME" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-signal"></span>
          <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 11.5 12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button @click="setPage(Pages.PLAYGROUND)" title="Playground"
          class="relative w-full h-10 grid place-items-center rounded-[7px] transition-colors duration-150"
          :class="page === Pages.PLAYGROUND ? 'bg-signal/10 text-signal' : 'text-ink-dim hover:text-ink hover:bg-deck-700/60'">
          <span v-if="page === Pages.PLAYGROUND" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-signal"></span>
          <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="7" width="18" height="10" rx="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="8" cy="12" r="1.2" fill="currentColor"/>
            <circle cx="16" cy="10.5" r="1" fill="currentColor"/>
            <circle cx="17.5" cy="13" r="1" fill="currentColor"/>
          </svg>
        </button>

        <button @click="setPage(Pages.SETTINGS)" title="Settings"
          class="relative w-full h-10 grid place-items-center rounded-[7px] transition-colors duration-150"
          :class="page === Pages.SETTINGS ? 'bg-signal/10 text-signal' : 'text-ink-dim hover:text-ink hover:bg-deck-700/60'">
          <span v-if="page === Pages.SETTINGS" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-signal"></span>
          <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button @click="setPage(Pages.FAVORITES)" title="Favorites"
          class="relative w-full h-10 grid place-items-center rounded-[7px] transition-colors duration-150"
          :class="page === Pages.FAVORITES ? 'bg-signal/10 text-signal' : 'text-ink-dim hover:text-ink hover:bg-deck-700/60'">
          <span v-if="page === Pages.FAVORITES" class="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-signal"></span>
          <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 17.3 6.2 21l1.5-6.6L2.5 9.9l6.7-.6L12 3l2.8 6.3 6.7.6-5.2 4.5L18 21z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </nav>

      <div class="w-full px-3 flex flex-col gap-1.5 mt-6">
        <div class="border border-line rounded-[7px] py-1.5 text-center bg-deck-900/50">
          <div class="eyebrow text-[8px] tracking-[0.14em]">Tracked</div>
          <div class="font-mono text-[15px] leading-none mt-1 text-ink">{{ gameList.length }}</div>
        </div>

        <!-- Connection state. The bolt only appears while Rich Presence is
             actually live, so the glyph itself carries the meaning. -->
        <div class="border rounded-[7px] py-1.5 flex flex-col items-center gap-1"
          :class="isConnectedToRPC ? 'border-live/40 bg-live/5' : 'border-line bg-deck-900/50'">
          <svg v-if="isConnectedToRPC" class="h-3 w-3 text-live" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>
          </svg>
          <span v-else class="w-1.5 h-1.5 rounded-full bg-ink-faint"></span>
          <span class="eyebrow text-[8px] tracking-[0.14em]"
            :class="isConnectedToRPC ? 'text-live' : ''">
            {{ isConnectedToRPC ? 'Connected' : 'Idle' }}
          </span>
        </div>
      </div>

      <div class="mt-auto w-full px-3 flex flex-col items-center gap-2.5">
        <button @click="openCommandPalette" title="Open command palette"
          class="flex items-center gap-1 text-ink-faint hover:text-signal transition-colors">
          <kbd class="font-mono text-[9px] border border-line rounded px-1 py-px bg-deck-900/70">Ctrl</kbd>
          <kbd class="font-mono text-[9px] border border-line rounded px-1 py-px bg-deck-900/70">K</kbd>
        </button>
        <div class="eyebrow text-[7px] tracking-[0.12em] text-center leading-[1.6] text-ink-faint">
          Made by<br/>Volk.xp
        </div>
      </div>
    </aside>

    <!-- Main content area. The column is fixed height and the inner wrapper does
         the scrolling, so pages can pin their own headers if they want to. -->
    <main class="flex-1 min-w-0 flex flex-col overflow-hidden bg-deck-900/35 backdrop-blur-lg">
      <UpdateBanner />
      <div class="flex-1 min-h-0 overflow-y-auto">
        <slot />
      </div>
    </main>

    <OnboardingWizard />
    <CommandPalette />
    <ToastContainer />
  </div>
</template>
