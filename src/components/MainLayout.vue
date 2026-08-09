<script setup lang="ts">
import { Pages, useGlobalState } from '@/composables/app-state';
import CommandPalette from './CommandPalette.vue';
import OnboardingWizard from './OnboardingWizard.vue';
import ToastContainer from './ToastContainer.vue';
import UpdateBanner from './UpdateBanner.vue';

// Layout component for consistent page structure

const appState = useGlobalState();
const { page, setPage } = appState;

function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('dqc:open-palette'));
}

</script>

<template>
  <div class="flex h-dvh overflow-hidden">
    <!-- Sidebar nav rail -->
    <aside class="w-20 flex flex-col items-center py-5 gap-6 bg-slate-950/40 backdrop-blur-xl border-r border-cyan-900/40">
      <div class="flex flex-col items-center gap-1">
        <svg class="h-6 w-6 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>
        </svg>
        <img src="/logo.svg" alt="Logo" class="h-7 w-7" />
      </div>

      <nav class="flex flex-col items-center gap-5 mt-2">
        <button @click="setPage(Pages.HOME)" title="Home"
          class="p-2 rounded-lg transition-colors"
          :class="page === Pages.HOME ? 'bg-cyan-950/60 text-cyan-400' : 'text-cyan-200/50 hover:text-cyan-300 hover:bg-cyan-950/30'">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 11.5 12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button @click="setPage(Pages.PLAYGROUND)" title="Playground"
          class="p-2 rounded-lg transition-colors"
          :class="page === Pages.PLAYGROUND ? 'bg-cyan-950/60 text-cyan-400' : 'text-cyan-200/50 hover:text-cyan-300 hover:bg-cyan-950/30'">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="7" width="18" height="10" rx="3" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="8" cy="12" r="1.2" fill="currentColor"/>
            <circle cx="16" cy="10.5" r="1" fill="currentColor"/>
            <circle cx="17.5" cy="13" r="1" fill="currentColor"/>
          </svg>
        </button>

        <button @click="setPage(Pages.SETTINGS)" title="Settings"
          class="p-2 rounded-lg transition-colors"
          :class="page === Pages.SETTINGS ? 'bg-cyan-950/60 text-cyan-400' : 'text-cyan-200/50 hover:text-cyan-300 hover:bg-cyan-950/30'">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.04Z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <button @click="setPage(Pages.FAVORITES)" title="Favorites"
          class="p-2 rounded-lg transition-colors"
          :class="page === Pages.FAVORITES ? 'bg-cyan-950/60 text-cyan-400' : 'text-cyan-200/50 hover:text-cyan-300 hover:bg-cyan-950/30'">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 17.3 6.2 21l1.5-6.6L2.5 9.9l6.7-.6L12 3l2.8 6.3 6.7.6-5.2 4.5L18 21z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </nav>

      <div class="mt-auto text-center">
        <div class="text-[9px] text-cyan-400/50 leading-tight">Made by<br/>Volk.xp</div>
        <button @click="openCommandPalette"
          class="text-[8px] text-cyan-400/70 hover:text-cyan-300 mt-2 border border-cyan-900/50 hover:border-cyan-700 rounded px-1.5 py-0.5 transition-colors">
          Ctrl+K
        </button>
      </div>
    </aside>

    <!-- Main content area -->
    <main class="flex-1 overflow-y-auto bg-black/15 backdrop-blur-lg">
      <UpdateBanner />
      <slot />
    </main>

    <OnboardingWizard />
    <CommandPalette />
    <ToastContainer />
  </div>
</template>
