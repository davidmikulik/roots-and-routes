<script setup lang="ts">
import { useColorMode } from '#imports'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const route = useRoute()
const adminAuth = useAdminAuth()
const appSettings = useSettings()
const { t } = useT()
const adminPanelOpen = ref(false)
const menuOpen = ref(false)

// The version from package.json (nuxt.config.ts → runtimeConfig.public.build); its release notes are on /release-notes
const appVersion = (useRuntimeConfig().public.build as { version: string }).version

const navLinks: { to: string; key: MessageKey }[] = [
  { to: '/', key: 'nav.home' },
  { to: '/map', key: 'nav.map' },
  { to: '/tree', key: 'nav.tree' },
  { to: '/graph', key: 'nav.graph' },
  { to: '/gedcom', key: 'nav.gedcom' },
]

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) adminPanelOpen.value = false
}
const toggleAdminPanel = () => {
  adminPanelOpen.value = !adminPanelOpen.value
  if (adminPanelOpen.value) menuOpen.value = false
}
// Close the menu after choosing a page
watch(() => route.path, () => { menuOpen.value = false })
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
    case '/graph': return t('title.graph')
    case '/gedcom': return t('title.gedcom')
    case '/settings': return t('title.settings')
    case '/admin/locations': return t('title.locations')
    case '/admin/layers': return t('title.layers')
    case '/release-notes': return t('title.releases')
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
          <div class="flex items-center space-x-3 min-w-0">
            <div class="w-10 h-10 shrink-0 rounded-full bg-primary-600 flex items-center justify-center">
              <span class="text-white font-bold text-lg">RR</span>
            </div>
            <div class="min-w-0">
              <h1 class="text-base sm:text-xl font-bold truncate" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ t('app.name') }}
              </h1>
              <p class="hidden sm:block text-sm opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
                {{ t('app.tagline') }}
              </p>
            </div>
          </div>

          <nav class="hidden md:flex items-center space-x-8">
            <NuxtLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="transition-colors duration-200 font-medium"
              :class="{
                'text-primary-500': route.path === link.to,
                'text-white hover:text-primary-400': isDark && route.path !== link.to,
                'text-gray-700 hover:text-primary-600': !isDark && route.path !== link.to,
              }"
            >{{ t(link.key) }}</NuxtLink>
          </nav>

          <div class="relative flex items-center space-x-2 sm:space-x-4 shrink-0">
            <button
              @click="toggleAdminPanel"
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
            <button
              @click="toggleMenu"
              class="md:hidden p-2 rounded-full transition-colors duration-200"
              :class="{
                'bg-gray-700 hover:bg-gray-600': isDark,
                'bg-gray-200 hover:bg-gray-300': !isDark,
              }"
              aria-controls="mobile-menu"
              :aria-expanded="menuOpen"
              :aria-label="menuOpen ? t('nav.menuClose') : t('nav.menuOpen')"
            >
              <span class="block w-6 text-center text-xl leading-7">{{ menuOpen ? '✕' : '☰' }}</span>
            </button>
          </div>
        </div>

        <nav
          v-if="menuOpen"
          id="mobile-menu"
          class="md:hidden border-t py-2"
          :class="{ 'border-gray-700': isDark, 'border-gray-200': !isDark }"
          :aria-label="t('nav.menu')"
        >
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="block px-3 py-3 rounded-lg font-medium transition-colors duration-200"
            :class="{
              'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300': route.path === link.to,
              'text-white hover:bg-gray-700': isDark && route.path !== link.to,
              'text-gray-700 hover:bg-gray-100': !isDark && route.path !== link.to,
            }"
          >{{ t(link.key) }}</NuxtLink>
        </nav>
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
          <p class="mt-1">
            <NuxtLink to="/release-notes" class="underline hover:text-primary-600" data-footer-releases>{{ t('footer.version', { version: appVersion }) }} · {{ t('footer.releases') }}</NuxtLink>
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
