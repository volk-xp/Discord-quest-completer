<script setup lang="ts">
import { Pages, useGlobalState } from '@/composables/app-state';

// Layout component for consistent page structure

const appState = useGlobalState();
const { page, setPage } = appState;

</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-red-50 dark:bg-neutral-950">
    <header class="bg-gradient-to-r from-black dark:from-black via-red-950 dark:via-red-950 to-red-900 dark:to-red-900 shadow-md border-b border-red-900 dark:shadow-[0_1px_20px_-4px_rgba(220,38,38,0.5)]">
      <div class="container mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <svg class="h-5 w-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c1.5 1.5 2 3.5 2 5.5A6.5 6.5 0 0 1 5 14.5C5 9 9 6 12 2z"/>
          </svg>
          <img src="/logo.svg" alt="Logo" class="h-8 w-8" />
          <h2 class="text-xl font-bold text-white"></h2>
        </div>
        <nav>
          <ul class="flex space-x-6">
            <li>
              <a href="#" 
                class="text-red-200 hover:text-red-400"
                :class="{ 'text-red-400 font-semibold': page === Pages.HOME }"
                @click.prevent="setPage(Pages.HOME)"
              >
                Home
              </a>
            </li> 
            <li>
              <a href="#" 
                class="text-red-200 hover:text-red-400"
                :class="{ 'text-red-400 font-semibold': page === Pages.PLAYGROUND }"
                @click.prevent="setPage(Pages.PLAYGROUND)"
              >
                Playground
              </a>
            </li>
            <li>
              <a href="#" class="text-red-200 hover:text-red-400">Settings</a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
    
    <main class="flex-grow overflow-y-auto">
      <slot></slot>
    </main>
    
    <footer class="bg-black dark:bg-black border-t border-red-900 mt-auto">
      <div class="container mx-auto px-4 py-4 text-center text-sm text-red-400/80">
        Made by Volk.xp
      </div>
    </footer>
  </div>
</template>