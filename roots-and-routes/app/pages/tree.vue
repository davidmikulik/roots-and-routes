<script setup lang="ts">
import { useColorMode } from '#imports'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const viewMode = ref<'tree' | 'chart' | 'list'>('tree')
const selectedPerson = ref<any>(null)
const searchQuery = ref('')

const samplePeople = ref([
  {
    id: '1',
    fullName: 'Jan Novák',
    shortName: 'Jan Novák',
    lifespan: '1850-1920',
    sex: 'M',
    generation: 1,
    isRoot: true,
    expanded: true,
    father: null,
    mother: null,
    spouses: [],
    children: [],
  },
  {
    id: '2',
    fullName: 'Marie Svobodová',
    shortName: 'Marie Svobodová',
    lifespan: '1855-1930',
    sex: 'F',
    generation: 1,
    isRoot: false,
    expanded: true,
    father: null,
    mother: null,
    spouses: [],
    children: [],
  },
])

const filteredPeople = computed(() => {
  if (!searchQuery.value) return samplePeople.value
  const query = searchQuery.value.toLowerCase()
  return samplePeople.value.filter(person => 
    person.fullName.toLowerCase().includes(query) ||
    (person.lifespan && person.lifespan.includes(query))
  )
})

const setViewMode = (mode: 'tree' | 'chart' | 'list') => {
  viewMode.value = mode
}

const getPersonColor = (person: any): string => {
  if (person.sex === 'M') return '#3b82f6'
  if (person.sex === 'F') return '#ec4899'
  return '#6b7280'
}

const selectPerson = (person: any) => {
  selectedPerson.value = person
}
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        Family Tree
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        Visualize your family relationships
      </p>
    </div>

    <div class="mb-6 flex flex-wrap gap-4 items-center">
      <div class="flex gap-2">
        <button
          @click="setViewMode('tree')"
          class="px-4 py-2 rounded-lg transition-colors"
          :class="{
            'bg-primary-600 text-white': viewMode === 'tree',
            'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white': viewMode !== 'tree',
          }"
        >
          Tree View
        </button>
        <button
          @click="setViewMode('chart')"
          class="px-4 py-2 rounded-lg transition-colors"
          :class="{
            'bg-primary-600 text-white': viewMode === 'chart',
            'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white': viewMode !== 'chart',
          }"
        >
          Chart View
        </button>
        <button
          @click="setViewMode('list')"
          class="px-4 py-2 rounded-lg transition-colors"
          :class="{
            'bg-primary-600 text-white': viewMode === 'list',
            'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white': viewMode !== 'list',
          }"
        >
          List View
        </button>
      </div>
      
      <div class="relative flex-1 min-w-64">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search people..."
          class="w-full px-4 py-2 rounded-lg border transition-colors"
          :class="{
            'bg-gray-800 border-gray-600 text-white': isDark,
            'bg-white border-gray-200 text-gray-900': !isDark,
          }"
        >
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      </div>
    </div>

    <div v-if="viewMode === 'list'" class="overflow-x-auto">
      <table class="w-full">
        <thead class="border-b">
          <tr :class="{ 'border-gray-700': isDark, 'border-gray-200': !isDark }">
            <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
              Name
            </th>
            <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
              Lifespan
            </th>
            <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
              Generation
            </th>
            <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
              Sex
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in filteredPeople"
            :key="person.id"
            class="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            :class="{
              'border-gray-700': isDark,
              'border-gray-200': !isDark,
              'bg-primary-50 dark:bg-primary-900/20': selectedPerson?.id === person.id,
            }"
            @click="selectPerson(person)"
          >
            <td class="p-4">
              <div class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ person.fullName }}
              </div>
              <div v-if="person.isRoot" class="text-xs opacity-60">Root</div>
            </td>
            <td class="p-4">
              {{ person.lifespan || 'N/A' }}
            </td>
            <td class="p-4">
              {{ person.generation }}
            </td>
            <td class="p-4">
              <span :class="{
                'text-blue-600': person.sex === 'M',
                'text-pink-600': person.sex === 'F',
                'text-gray-500': !person.sex,
              }">
                {{ person.sex === 'M' ? 'Male' : person.sex === 'F' ? 'Female' : 'Unknown' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="filteredPeople.length === 0" class="text-center py-12">
        <p class="opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
          No people found matching your search.
        </p>
      </div>
    </div>

    <div v-if="viewMode !== 'list'" class="p-8 text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
      <div class="text-4xl mb-4">🌳</div>
      <h3 class="font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        {{ viewMode === 'tree' ? 'Tree View' : 'Chart View' }}
      </h3>
      <p class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
        This view will display your family tree. Upload a GEDCOM file to see your data.
      </p>
      <NuxtLink
        to="/gedcom"
        class="inline-block mt-4 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
      >
        Import GEDCOM File
      </NuxtLink>
    </div>

    <div v-if="selectedPerson" class="mt-8 p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
      <button
        @click="selectedPerson = null"
        class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300"
      >
        ×
      </button>
      
      <div class="flex items-start gap-6">
        <div class="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg" :style="{ backgroundColor: getPersonColor(selectedPerson) }">
          <span class="text-white">
            {{ selectedPerson.sex === 'M' ? '👨' : selectedPerson.sex === 'F' ? '👩' : '👤' }}
          </span>
        </div>
        
        <div class="flex-1">
          <h2 class="text-2xl font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ selectedPerson.fullName }}
          </h2>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                Lifespan
              </div>
              <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ selectedPerson.lifespan || 'N/A' }}
              </div>
            </div>
            <div>
              <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                Generation
              </div>
              <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ selectedPerson.generation }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-8 p-8 rounded-lg text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-100': !isDark }">
      <p class="text-lg opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        No GEDCOM data loaded. Please import a GEDCOM file to view your family tree.
      </p>
      <NuxtLink
        to="/gedcom"
        class="inline-block mt-4 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
      >
        Import GEDCOM File
      </NuxtLink>
    </div>
  </div>
</template>
