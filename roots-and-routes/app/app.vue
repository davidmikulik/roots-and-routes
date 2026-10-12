<script setup lang="ts">
import { useColorMode } from '#imports'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const route = useRoute()
const adminAuth = useAdminAuth()
const appSettings = useSettings()
const { t } = useT()
const adminPanelOpen = ref(false)
// The store keeps unsaved edits here when auto-save is off (see useGedcomStore)
const gedcomState = useState<{ dirty?: boolean } | null>('gedcom-store')

// Restore saved token and settings after hydration (pages are prerendered without them)
onMounted(() => {
  adminAuth.restore()
  appSettings.restore()
  window.addEventListener('beforeunload', (event) => {
    if (gedcomState.value?.dirty) event.preventDefault()
  })
})

const toggleDark = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
const pageTitle = computed(() => {
  switch (route.path) {
    case '/': return t('title.home')
    case '/map': return t('title.map')
    case '/tree': return t('title.tree')
    case '/gedcom': return t('title.gedcom')
    case '/settings': return t('title.settings')
    case '/admin/locations': return t('title.locations')
    default: return t('app.name')
  }
})

useHead({
  htmlAttrs: { lang: computed(() => appSettings.settings.value.language) },
  title: computed(() => `${pageTitle.value} | ${t('app.name')}`),
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
                {{ t('app.name') }}
              </h1>
              <p class="text-sm opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
                {{ t('app.tagline') }}
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
            >{{ t('nav.home') }}</NuxtLink>
            <NuxtLink
              to="/map"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/map',
                'text-white hover:text-primary-400': isDark && route.path !== '/map',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/map',
              }"
            >{{ t('nav.map') }}</NuxtLink>
            <NuxtLink
              to="/tree"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/tree',
                'text-white hover:text-primary-400': isDark && route.path !== '/tree',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/tree',
              }"
            >{{ t('nav.tree') }}</NuxtLink>
            <NuxtLink
              to="/gedcom"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === '/gedcom',
                'text-white hover:text-primary-400': isDark && route.path !== '/gedcom',
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== '/gedcom',
              }"
            >{{ t('nav.gedcom') }}</NuxtLink>
          </nav>

          <div class="relative flex items-center space-x-4">
            <button
              @click="adminPanelOpen = !adminPanelOpen"
              class="p-2 rounded-full transition-colors duration-200"
              :class="{
                'bg-gray-700 hover:bg-gray-600': isDark,
                'bg-gray-200 hover:bg-gray-300': !isDark,
              }"
              :aria-label="adminAuth.isAdmin.value ? t('admin.mode') : t('admin.login')"
              :title="adminAuth.isAdmin.value ? t('admin.mode') : t('admin.login')"
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
              @click="toggleDark"
              class="p-2 rounded-full transition-colors duration-200"
              :class="{
                'bg-gray-700 hover:bg-gray-600': isDark,
                'bg-gray-200 hover:bg-gray-300': !isDark,
              }"
              :aria-label="t('nav.toggleDark')"
            >
              <span class="text-xl">{{ isDark ? '🌙' : '☀️' }}</span>
            </button>
            <NuxtLink
              to="/settings"
              :aria-label="t('nav.settings')"
              :title="t('nav.settings')"
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
          <p>© {{ new Date().getFullYear() }} {{ t('app.name') }}. {{ t('footer.rights') }}</p>
          <p class="mt-1">
            {{ t('footer.builtWith') }}
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
