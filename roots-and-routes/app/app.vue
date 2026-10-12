<script setup lang="ts">
import { useColorMode } from '#imports'
import { useAdminAuth } from '~~/composables/useAdminAuth'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const route = useRoute()
const adminAuth = useAdminAuth()
const adminPanelOpen = ref(false)

// Restore the saved token after hydration (pages are prerendered without it)
onMounted(() => adminAuth.restore())
const pageTitle = computed(() => {
  switch (route.path) {
    case '/': return 'Home'
    case '/map': return 'Map Visualization'
    case '/tree': return 'Family Tree'
    case '/gedcom': return 'GEDCOM Import/Export'
    case '/settings': return 'Settings'
    default: return 'Roots & Routes'
  }
})

useHead({
  title: computed(() => `${pageTitle.value} | Roots & Routes`),
})
</script>

<template>
  <div class="min-h-screen transition-colors duration-300" :class="{ 'bg-gray-900': isDark, 'bg-gray-50': !isDark }">
    <header class="shadow-sm" :class="{ 'bg-gray-800': isDark, 'bg-white': !isDark }">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center">
              <span class="text-white font-bold text-lg">RR</span>
            </div>
            <div>
              <h1 class="text-xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                Roots & Routes
              </h1>
              <p class="text-sm opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
                Genealogy Visualization
              </p>
            </div>
          </div>

          <nav class="hidden md:flex items-center space-x-8">
            <NuxtLink
              to="/"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/',
                'text-white hover:text-primary-400': isDark && route.path !== '/',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/',
              }"
            >Home</NuxtLink>
            <NuxtLink
              to="/map"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/map',
                'text-white hover:text-primary-400': isDark && route.path !== '/map',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/map',
              }"
            >Map</NuxtLink>
            <NuxtLink
              to="/tree"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/tree',
                'text-white hover:text-primary-400': isDark && route.path !== '/tree',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/tree',
              }"
            >Tree</NuxtLink>
            <NuxtLink
              to="/gedcom"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/gedcom',
                'text-white hover:text-primary-400': isDark && route.path !== '/gedcom',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/gedcom',
              }"
            >GEDCOM</NuxtLink>
          </nav>

          <div class="relative flex items-center space-x-4">
            <button
              @click="adminPanelOpen = !adminPanelOpen"
              class="p-2 rounded-full transition-colors duration-200"
              :class="{
                'bg-gray-700 hover:bg-gray-600': isDark,
                'bg-gray-200 hover:bg-gray-300': !isDark,
              }"
              :aria-label="adminAuth.isAdmin.value ? 'Administrator mode' : 'Administrator login'"
              :title="adminAuth.isAdmin.value ? 'Administrator mode' : 'Administrator login'"
            >
              <span class="text-xl">{{ adminAuth.isAdmin.value ? '🔓' : '🔒' }}</span>
            </button>
            <div
              v-if="adminPanelOpen"
              class="absolute right-0 top-12 z-50 w-80 p-4 rounded-lg border shadow-lg"
              :class="{ 'bg-gray-800 border-gray-600 text-white': isDark, 'bg-white border-gray-200 text-gray-900': !isDark }"
            >
              <AdminLogin @done="adminPanelOpen = false" />
            </div>
            <button
              @click="colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'"
              class="p-2 rounded-full transition-colors duration-200"
              :class="{
                'bg-gray-700 hover:bg-gray-600': isDark,
                'bg-gray-200 hover:bg-gray-300': !isDark,
              }"
              aria-label="Toggle dark mode"
            >
              <span class="text-xl">{{ isDark ? '🌙' : '☀️' }}</span>
            </button>
            <NuxtLink
              to="/settings"
              class="p-2 rounded-full transition-colors duration-200"
              :class="{
                'bg-gray-700 hover:bg-gray-600': isDark,
                'bg-gray-200 hover:bg-gray-300': !isDark,
              }"
            >
              <span class="text-xl">⚙️</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <NuxtPage />
    </main>

    <footer class="mt-16 py-8 border-t" :class="{ 'border-gray-700': isDark, 'border-gray-200': !isDark }">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center text-sm opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
          <p>© {{ new Date().getFullYear() }} Roots & Routes. All rights reserved.</p>
          <p class="mt-1">
            Built with Nuxt 3, Vue.js, and Leaflet.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
