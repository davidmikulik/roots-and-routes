<script setup lang="ts">
// Home page: what the app offers and the way to the map and the trees. It has no administrator actions (import,
// administration); the administrator finds them in the lock panel in the header once logged in (AdminMenu.vue).
// What changed in each version is in Settings → About.
import { useColorMode } from '#imports'
import { useT } from '~~/composables/useT'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const { t } = useT()

const features = computed(() => [
  { icon: '🗺️', title: t('home.feature.map.title'), description: t('home.feature.map.desc'), route: '/map' },
  { icon: '🌳', title: t('home.feature.tree.title'), description: t('home.feature.tree.desc'), route: '/graph' },
  { icon: '✏️', title: t('home.feature.gedcom.title'), description: t('home.feature.gedcom.desc'), route: '/tree' },
  { icon: '🔍', title: t('home.feature.search.title'), description: t('home.feature.search.desc'), route: '/tree' },
])
</script>

<template>
  <div class="min-h-screen">
    <section class="py-16 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto text-center">
        <h1 class="text-4xl md:text-6xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          <span class="bg-gradient-to-r from-primary-500 to-primary-700 bg-clip-text text-transparent">
            Roots & Routes
          </span>
        </h1>

        <p class="text-xl md:text-2xl mb-4" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
          {{ t('home.welcome') }}
        </p>

        <p class="text-lg opacity-80 max-w-2xl mx-auto mb-12" :class="{ 'text-gray-400': isDark, 'text-gray-500': !isDark }">
          {{ t('home.intro') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center" data-home-actions>
          <NuxtLink
            to="/map"
            class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl bg-primary-600 hover:bg-primary-700 text-white"
          >
            <span class="mr-2">🗺️</span>
            {{ t('home.viewMap') }}
          </NuxtLink>

          <NuxtLink
            to="/graph"
            class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-lg transition-all duration-200 border-2 shadow-lg hover:shadow-xl"
            :class="{
              'bg-transparent hover:bg-primary-50 border-primary-600 text-primary-600': !isDark,
              'bg-transparent hover:bg-gray-800 border-gray-600 text-white': isDark,
            }"
          >
            <span class="mr-2">🌳</span>
            {{ t('home.viewGraph') }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="py-16 px-4 sm:px-6 lg:px-8" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
      <div class="max-w-7xl mx-auto">
        <h2 class="text-3xl font-bold text-center mb-16" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          {{ t('home.coreFeatures') }}
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <NuxtLink
            v-for="feature in features"
            :key="feature.title"
            :to="feature.route"
            class="block p-8 rounded-2xl transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
            :class="{
              'bg-gray-700/50 hover:bg-gray-700': isDark,
              'bg-white': !isDark,
            }"
            data-home-feature
          >
            <div class="text-5xl mb-4">{{ feature.icon }}</div>
            <h3 class="text-xl font-bold mb-3" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ feature.title }}
            </h3>
            <p class="opacity-80" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
              {{ feature.description }}
            </p>
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
