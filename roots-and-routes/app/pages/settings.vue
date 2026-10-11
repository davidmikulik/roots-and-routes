<script setup lang="ts">
import { useColorMode } from '#imports'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const settings = ref({
  map: {
    defaultStyle: 'osm',
    defaultZoom: 7,
    defaultCenter: [50.0755, 14.4378] as [number, number],
    showClusters: true,
    showMigrationLines: false,
    autoGeocode: true,
  },
  tree: {
    defaultView: 'tree' as 'tree' | 'chart' | 'list',
    showPhotos: true,
    showDetails: true,
    maxGenerations: 10,
  },
  data: {
    language: 'en',
    autoSave: true,
    backupOnImport: true,
    backupCount: 5,
  },
  privacy: {
    shareData: false,
    anonymousMode: false,
  },
})

const activeSection = ref('general')

const sections = [
  { id: 'general', name: 'General', icon: '⚙️' },
  { id: 'map', name: 'Map Settings', icon: '🗺️' },
  { id: 'tree', name: 'Tree Settings', icon: '🌳' },
  { id: 'data', name: 'Data & Backup', icon: '💾' },
  { id: 'privacy', name: 'Privacy', icon: '🔒' },
  { id: 'about', name: 'About', icon: 'ℹ️' },
]

const saveSettings = () => {
  console.log('Settings saved:', settings.value)
}

const resetToDefaults = () => {
  settings.value = {
    map: {
      defaultStyle: 'osm',
      defaultZoom: 7,
      defaultCenter: [50.0755, 14.4378] as [number, number],
      showClusters: true,
      showMigrationLines: false,
      autoGeocode: true,
    },
    tree: {
      defaultView: 'tree',
      showPhotos: true,
      showDetails: true,
      maxGenerations: 10,
    },
    data: {
      language: 'en',
      autoSave: true,
      backupOnImport: true,
      backupCount: 5,
    },
    privacy: {
      shareData: false,
      anonymousMode: false,
    },
  }
}

const exportSettings = () => {
  const data = JSON.stringify(settings.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'roots-and-routes-settings.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const importSettings = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        settings.value = { ...settings.value, ...data }
      } catch (error) {
        console.error('Failed to import settings:', error)
      }
    }
    reader.readAsText(input.files[0])
  }
}

const themeOptions = [
  { value: 'light', label: 'Light Mode', icon: '☀️' },
  { value: 'dark', label: 'Dark Mode', icon: '🌙' },
  { value: 'system', label: 'System Preference', icon: '🖥️' },
]

const setTheme = (theme: string) => {
  colorMode.value = theme as 'light' | 'dark' | 'system'
}

const router = useRouter()
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        Settings
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        Configure your application preferences
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <nav class="p-2">
            <button
              v-for="section in sections"
              :key="section.id"
              @click="activeSection = section.id"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left"
              :class="{
                'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300': activeSection === section.id,
                'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50': activeSection !== section.id,
              }"
            >
              <span>{{ section.icon }}</span>
              <span>{{ section.name }}</span>
            </button>
          </nav>
        </div>
        
        <div class="mt-6 space-y-3">
          <button
            @click="saveSettings"
            class="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
          >
            Save Settings
          </button>
          <button
            @click="resetToDefaults"
            class="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors font-medium"
          >
            Reset to Defaults
          </button>
          <div class="flex gap-3">
            <button
              @click="exportSettings"
              class="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm font-medium"
            >
              Export
            </button>
            <label class="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm font-medium cursor-pointer">
              Import
              <input type="file" accept=".json" @change="importSettings" class="hidden">
            </label>
          </div>
        </div>
      </div>
      
      <div class="lg:col-span-3">
        <div v-if="activeSection === 'general'" class="space-y-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              General Settings
            </h2>
            
            <div class="space-y-4">
              <div class="grid grid-cols-3 gap-4">
                <button
                  v-for="theme in themeOptions"
                  :key="theme.value"
                  @click="setTheme(theme.value)"
                  class="p-4 rounded-lg border-2 transition-all text-center"
                  :class="{
                    'border-primary-500 bg-primary-50 dark:bg-primary-900/20': colorMode.value === theme.value,
                    'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600': colorMode.value !== theme.value,
                  }"
                >
                  <div class="text-3xl mb-2">{{ theme.icon }}</div>
                  <div class="text-sm font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                    {{ theme.label }}
                  </div>
                </button>
              </div>
              
              <div class="flex flex-col gap-2">
                <label class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  Language
                </label>
                <select
                  v-model="settings.data.language"
                  class="px-4 py-2 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                  :class="{ 'text-gray-900': !isDark, 'text-white': isDark }"
                >
                  <option value="en">English</option>
                  <option value="cs">Čeština</option>
                </select>
              </div>
              
              <div class="flex flex-col gap-2">
                <label class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  Default View
                </label>
                <select
                  v-model="settings.tree.defaultView"
                  class="px-4 py-2 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                  :class="{ 'text-gray-900': !isDark, 'text-white': isDark }"
                >
                  <option value="tree">Tree View</option>
                  <option value="chart">Chart View</option>
                  <option value="list">List View</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="activeSection === 'map'" class="space-y-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Map Settings
            </h2>
            
            <div class="space-y-6">
              <div class="flex flex-col gap-2">
                <label class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  Default Zoom Level
                </label>
                <input
                  v-model.number="settings.map.defaultZoom"
                  type="range"
                  min="1"
                  max="18"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                >
                <div class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ settings.map.defaultZoom }}
                </div>
              </div>
              
              <div class="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span>🎯</span>
                    <span :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Show Clusters</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input v-model="settings.map.showClusters" type="checkbox" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                  </label>
                </div>
                
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span>✈️</span>
                    <span :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Show Migration Lines</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input v-model="settings.map.showMigrationLines" type="checkbox" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                  </label>
                </div>
                
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span>📍</span>
                    <span :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Auto Geocode</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input v-model="settings.map.autoGeocode" type="checkbox" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="activeSection === 'tree'" class="space-y-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Tree Settings
            </h2>
            
            <div class="space-y-6">
              <div class="flex flex-col gap-2">
                <label class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  Maximum Generations to Display
                </label>
                <input
                  v-model.number="settings.tree.maxGenerations"
                  type="range"
                  min="1"
                  max="20"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                >
                <div class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ settings.tree.maxGenerations }}
                </div>
              </div>
              
              <div class="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span>📷</span>
                    <span :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Show Photos</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input v-model="settings.tree.showPhotos" type="checkbox" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                  </label>
                </div>
                
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span>📋</span>
                    <span :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Show Detailed Info</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input v-model="settings.tree.showDetails" type="checkbox" class="sr-only peer">
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="activeSection === 'data'" class="space-y-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Data & Backup Settings
            </h2>
            
            <div class="space-y-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span>💾</span>
                  <div>
                    <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Auto Save</div>
                    <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                      Automatically save changes
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.data.autoSave" type="checkbox" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                </label>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span>📥</span>
                  <div>
                    <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Backup on Import</div>
                    <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                      Create backup before importing new data
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.data.backupOnImport" type="checkbox" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                </label>
              </div>
              
              <div class="flex flex-col gap-2">
                <label class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  Number of Backups to Keep
                </label>
                <input
                  v-model.number="settings.data.backupCount"
                  type="range"
                  min="1"
                  max="20"
                  class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                >
                <div class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ settings.data.backupCount }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-if="activeSection === 'privacy'" class="space-y-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Privacy Settings
            </h2>
            
            <div class="space-y-6">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span>📤</span>
                  <div>
                    <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Share Data</div>
                    <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                      Allow sharing of anonymized usage data
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.privacy.shareData" type="checkbox" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                </label>
              </div>
              
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span>👤</span>
                  <div>
                    <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Anonymous Mode</div>
                    <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                      Hide personal information in shared views
                    </p>
                  </div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="settings.privacy.anonymousMode" type="checkbox" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:bg-gray-700 peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>
          </div>
          
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 class="text-lg font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              Data Privacy
            </h3>
            <p class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              Your GEDCOM data is processed locally in your browser. We do not store or transmit your personal data to our servers without your explicit consent.
            </p>
          </div>
        </div>
        
        <div v-if="activeSection === 'about'" class="space-y-6">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              About Roots & Routes
            </h2>
            
            <div class="space-y-4">
              <div class="flex items-start gap-4">
                <span class="text-3xl">🌳</span>
                <div>
                  <h3 class="font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                    Version 1.0.0
                  </h3>
                  <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                    Built with Nuxt 3, Vue.js, TypeScript, and Leaflet
                  </p>
                </div>
              </div>
              
              <div class="flex items-start gap-4">
                <span class="text-3xl">ℹ️</span>
                <div>
                  <h3 class="font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                    Features
                  </h3>
                  <ul class="text-sm list-disc list-inside mt-2 space-y-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                    <li>GEDCOM 5.5 and 7.0 support</li>
                    <li>Interactive map visualization with Leaflet</li>
                    <li>Family tree and chart views</li>
                    <li>Event filtering and search</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
