<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~/composables/useGedcomStore'
import type { AppPerson, FamilyTree } from '~/types/gedcom'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const gedcomStore = useGedcomStore()
const router = useRouter()

const viewMode = ref<'tree' | 'chart' | 'list'>('list')
const selectedPerson = ref<AppPerson | null>(null)
const searchQuery = ref('')
const rootPersonId = ref<string | null>(null)

// Get family tree from store
const familyTree = computed<FamilyTree | null>(() => {
  return gedcomStore.getFamilyTree(rootPersonId.value || undefined)
})

const allPeople = computed<AppPerson[]>(() => {
  return gedcomStore.getAllAppPersons()
})

const filteredPeople = computed<AppPerson[]>(() => {
  if (!searchQuery.value) return allPeople.value
  const query = searchQuery.value.toLowerCase()
  return allPeople.value.filter(person => 
    person.fullName.toLowerCase().includes(query) ||
    (person.lifespan && person.lifespan.toLowerCase().includes(query))
  )
})

const setViewMode = (mode: 'tree' | 'chart' | 'list') => {
  viewMode.value = mode
}

const getPersonColor = (person: AppPerson): string => {
  if (person.sex === 'M') return '#3b82f6'
  if (person.sex === 'F') return '#ec4899'
  return '#6b7280'
}

const selectPerson = (person: AppPerson) => {
  selectedPerson.value = person
  rootPersonId.value = person.id
}

const selectAsRoot = (person: AppPerson) => {
  rootPersonId.value = person.id
  selectedPerson.value = person
}

const clearSelection = () => {
  selectedPerson.value = null
}

const importGedcom = () => {
  router.push('/gedcom')
}

// Compute tree statistics
const treeStats = computed(() => {
  if (!familyTree.value) return { generations: 0, people: 0, families: 0 }
  return {
    generations: familyTree.value.generations,
    people: familyTree.value.people.size,
    families: familyTree.value.families.size
  }
})
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
      
      <button
        @click="importGedcom"
        class="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
      >
        Import GEDCOM
      </button>
    </div>

    <div v-if="!gedcomStore.hasData" class="p-12 text-center rounded-lg" :class="{ 'bg-gray-800': isDark, 'bg-gray-100': !isDark }">
      <div class="text-4xl mb-4">🌳</div>
      <h3 class="text-xl font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        No GEDCOM Data
      </h3>
      <p class="text-lg opacity-75 mb-6" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        Import a GEDCOM file to view your family tree
      </p>
      <button
        @click="importGedcom"
        class="px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium text-lg"
      >
        Import GEDCOM File
      </button>
    </div>

    <div v-else>
      <!-- Statistics Card -->
      <div class="mb-6 p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
        <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          Tree Statistics
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ gedcomStore.totalIndividuals }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              Individuals
            </div>
          </div>
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ gedcomStore.totalFamilies }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              Families
            </div>
          </div>
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ treeStats.generations }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              Generations
            </div>
          </div>
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ allPeople.length }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              Total People
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
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
              <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                Actions
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
              <td class="p-4">
                <button
                  @click.stop="selectAsRoot(person)"
                  class="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-800/30 transition-colors"
                >
                  Set as Root
                </button>
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

      <!-- Tree View (placeholder - would need a proper tree visualization library) -->
      <div v-if="viewMode === 'tree'" class="p-8 text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
        <div class="text-4xl mb-4">🌳</div>
        <h3 class="font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          Tree View
        </h3>
        <p class="text-sm opacity-75 mb-4" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
          Select a person as root to view their family tree hierarchy.
        </p>
        <p v-if="rootPersonId" class="text-sm mb-4">
          Current root: <strong>{{ selectedPerson?.fullName || 'None' }}</strong>
        </p>
        <button
          @click="setViewMode('list')"
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg transition-colors"
        >
          Back to List
        </button>
      </div>

      <!-- Chart View (placeholder) -->
      <div v-if="viewMode === 'chart'" class="p-8 text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
        <div class="text-4xl mb-4">📊</div>
        <h3 class="font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          Chart View
        </h3>
        <p class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
          Chart visualization coming soon. Use List View to browse all individuals.
        </p>
      </div>

      <!-- Selected Person Details -->
      <div v-if="selectedPerson" class="mt-8 p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
        <button
          @click="clearSelection"
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
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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
              <div>
                <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  Sex
                </div>
                <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  {{ selectedPerson.sex === 'M' ? 'Male' : selectedPerson.sex === 'F' ? 'Female' : 'Unknown' }}
                </div>
              </div>
            </div>
            
            <div v-if="selectedPerson.allCoordinates" class="mt-4">
              <div class="opacity-60 text-sm mb-2" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                Geographic Events
              </div>
              <div class="flex gap-2 flex-wrap">
                <span
                  v-for="[lat, lng, type] in selectedPerson.allCoordinates"
                  :key="`${lat}-${lng}-${type}`"
                  class="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs"
                >
                  {{ type }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
