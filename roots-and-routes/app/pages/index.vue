<script setup lang="ts">
import { useColorMode } from '#imports'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const welcomeMessage = ref('Discover your roots...')
const features = [
  {
    icon: '🗺️',
    title: 'Map Visualization',
    description: 'View your family history on interactive maps with birth, marriage, and death locations',
    route: '/map',
  },
  {
    icon: '🌳',
    title: 'Family Tree',
    description: 'Explore your genealogy with beautiful tree and chart visualizations',
    route: '/tree',
  },
  {
    icon: '📄',
    title: 'GEDCOM Import/Export',
    description: 'Import GEDCOM files or export your family tree in standard format',
    route: '/gedcom',
  },
  {
    icon: '🔍',
    title: 'Search & Filter',
    description: 'Find ancestors by name, date, or location with powerful search tools',
    route: '/tree',
  },
]
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
          {{ welcomeMessage }}
        </p>
        
        <p class="text-lg opacity-80 max-w-2xl mx-auto mb-12" :class="{ 'text-gray-400': isDark, 'text-gray-500': !isDark }">
          A comprehensive genealogy application for visualizing your family tree on maps.
          Import GEDCOM files, explore your ancestry, and discover the geographic history of your family.
        </p>
        
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <NuxtLink
            to="/gedcom"
            class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl bg-primary-600 hover:bg-primary-700 text-white"
          >
            <span class="mr-2">📁</span>
            Import GEDCOM
          </NuxtLink>
          
          <NuxtLink
            to="/map"
            class="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-lg transition-all duration-200 border-2 shadow-lg hover:shadow-xl"
            :class="{
              'bg-transparent hover:bg-primary-50 border-primary-600 text-primary-600': !isDark,
              'bg-transparent hover:bg-gray-800 border-gray-600 text-white': isDark,
            }"
          >
            <span class="mr-2">🗺️</span>
            View Map
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="py-16 px-4 sm:px-6 lg:px-8" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
      <div class="max-w-7xl mx-auto">
        <h2 class="text-3xl font-bold text-center mb-16" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          Core Features
        </h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div
            v-for="(feature, index) in features"
            :key="feature.title"
            class="p-8 rounded-2xl transition-all duration-300"
            :class="{
              'bg-gray-700/50': isDark,
              'bg-white': !isDark,
            }"
          >
            <div class="text-5xl mb-4">{{ feature.icon }}</div>
            <h3 class="text-xl font-bold mb-3" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ feature.title }}
            </h3>
            <p class="opacity-80" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="py-16 px-4 sm:px-6 lg:px-8">
      <div class="max-w-7xl mx-auto">
        <h2 class="text-3xl font-bold text-center mb-16" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          How It Works
        </h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-12 items-center">
          <div class="text-center">
            <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 flex items-center justify-center">
              <span class="text-4xl">1</span>
            </div>
            <h3 class="text-2xl font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Import Your Data
            </h3>
            <p class="opacity-80" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
              Upload your GEDCOM file from ancestry websites or genealogy software.
            </p>
          </div>
          
          <div class="text-center">
            <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 flex items-center justify-center">
              <span class="text-4xl">2</span>
            </div>
            <h3 class="text-2xl font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Explore Your Tree
            </h3>
            <p class="opacity-80" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
              Browse your family tree with interactive visualizations.
            </p>
          </div>
          
          <div class="text-center">
            <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 flex items-center justify-center">
              <span class="text-4xl">3</span>
            </div>
            <h3 class="text-2xl font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Visualize on Map
            </h3>
            <p class="opacity-80" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
              See your ancestors' journeys on interactive maps.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="py-16 px-4 sm:px-6 lg:px-8" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
      <div class="max-w-7xl mx-auto">
        <h2 class="text-3xl font-bold text-center mb-16" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          Ready to Explore Your Family History?
        </h2>
        <p class="text-lg opacity-80 mb-8 max-w-2xl mx-auto text-center" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
          Start by importing your GEDCOM file and discover the fascinating journey of your ancestors.
        </p>
        <div class="text-center">
          <NuxtLink
            to="/gedcom"
            class="inline-flex items-center justify-center px-10 py-4 text-xl font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
          >
            <span class="mr-3">🚀</span>
            Get Started
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>
