<script setup lang="ts">
import MainLayout from './components/MainLayout.vue';
import { Pages, useGlobalState } from './composables/app-state';
import HomeView from './pages/HomeView.vue';
import Playground from './pages/Playground.vue';
import SettingsView from './pages/SettingsView.vue';

const appState = useGlobalState();
const { page } = appState;

</script>

<template>
  <MainLayout>
    <HomeView v-show="page === Pages.HOME"/>
    <Playground v-show="page === Pages.PLAYGROUND"/>
    <SettingsView v-show="page === Pages.SETTINGS"/>
  </MainLayout>
</template>

<style>
/* Global styles are managed by Tailwind CSS */
</style>