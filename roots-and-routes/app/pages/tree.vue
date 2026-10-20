<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { usePersonEditor } from '~~/composables/usePersonEditor'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useAnonymize } from '~~/composables/useAnonymize'
import { messages, type MessageKey } from '~~/i18n'
import { useT } from '~~/composables/useT'
import { useKnownLocations } from '~~/composables/useKnownLocations'
import { normalizeText } from '~~/utils/gedcom/names'
import type { AppPerson, FamilyTree, GedcomEvent } from '~~/types/gedcom'

const { t } = useT()
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const gedcomStore = useGedcomStore()
const adminAuth = useAdminAuth()
const appSettings = useSettings()
const anon = useAnonymize()
const treeSettings = computed(() => appSettings.settings.value.tree)
const router = useRouter()

// Ensure data is loaded when visiting /tree directly
onMounted(async () => {
  console.log('[TREE] onMounted triggered, hasData:', gedcomStore.hasData.value)
  if (!gedcomStore.hasData.value) {
    console.log('[TREE] No data, refreshing from server...')
    await gedcomStore.refreshFromServer()
    console.log('[TREE] After refresh, hasData:', gedcomStore.hasData.value)
    console.log('[TREE] Individuals count:', gedcomStore.totalIndividuals.value)
  } else {
    console.log('[TREE] Already has data, individuals:', gedcomStore.totalIndividuals.value)
  }
})

const viewMode = ref<'tree' | 'chart' | 'list'>(appSettings.settings.value.tree.defaultView)
// The saved settings are read after the page mounted; apply the default view once they are known
if (!appSettings.ready.value) {
  watch(appSettings.ready, (ready) => { if (ready) viewMode.value = appSettings.settings.value.tree.defaultView }, { once: true })
}
const selectedPerson = ref<AppPerson | null>(null)
const searchQuery = ref('')
const rootPersonId = ref<string | null>(null)
// The person editor shared with the Graphical tree (app/components/PersonEditor.vue)
const editor = usePersonEditor(gedcomStore)

const eventLabel = (code: string): string => {
  const key = `tree.event.${code}`
  return key in messages.en ? t(key as MessageKey) : code
}

// Living or deceased (a death event, also without a date) next to the years of life; nothing when not known
const selectedLiving = computed(() => {
  const individual = selectedPerson.value ? gedcomStore.individuals.value.get(selectedPerson.value.id) : undefined
  if (!individual || anon.enabled.value) return ''
  if (individual.death) return t(individual.sex === 'M' ? 'tree.living.wasM' : individual.sex === 'F' ? 'tree.living.wasF' : 'tree.living.was')
  return individual.living ? t('tree.living.isLiving') : ''
})

// Detail of the selected person: geographic events with a hover bubble (place); years of life are in LifespanTips.vue
const selectedGeoEvents = computed(() => {
  const person = selectedPerson.value
  const individual = person ? gedcomStore.individuals.value.get(person.id) : undefined
  if (!individual) return []
  const withCoordinates = (event?: GedcomEvent): event is GedcomEvent =>
    !!event?.coordinates && !Number.isNaN(event.coordinates[0]) && !Number.isNaN(event.coordinates[1])
  // Same events and order as AppPerson.allCoordinates (convertToAppPerson)
  return [individual.birth, individual.baptism, individual.christening, individual.death, individual.burial, individual.cremation, ...individual.events]
    .filter(withCoordinates)
    .map((event, index) => ({ key: `${index}-${event.type}`, type: String(event.type), place: event.place || '' }))
})

// Historical map sheets of the selected person's places (Admin → Known locations); not in the anonymous mode
const knownLocations = useKnownLocations()
knownLocations.autoLoad()
const selectedArchiveMaps = computed(() => {
  if (anon.enabled.value) return []
  const places = [...new Set(selectedGeoEvents.value.map(event => event.place).filter(Boolean))]
  return places.map(place => ({ place, maps: knownLocations.archiveMapsFor(place) })).filter(entry => entry.maps.length)
})

const placeTip = (place: string): string => {
  if (anon.enabled.value) return t('tree.placeHidden')
  return place || t('tree.placeUnknown')
}

// Get family tree from store
const familyTree = computed<FamilyTree | null>(() => {
  return gedcomStore.getFamilyTree(rootPersonId.value || undefined)
})

const allPeople = computed<AppPerson[]>(() => {
  return gedcomStore.getAllAppPersons()
})

// Family names (birth surname and surname after marriage) with the number of people, for the filter; none in the
// anonymous mode, where the names are hidden
const familyName = ref('')
const familyNames = computed(() => {
  const counts = new Map<string, number>()
  for (const person of allPeople.value) for (const surname of anon.surnames(person)) counts.set(surname, (counts.get(surname) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, key: normalizeText(name) }))
    .sort((a, b) => a.key.localeCompare(b.key))
})
watch(familyNames, (names) => { if (familyName.value && !names.some(entry => entry.name === familyName.value)) familyName.value = '' })

// Search by given name, family name (birth or after marriage) or years; sorted by family name and given name.
// In anonymous mode only what is displayed can be searched (useAnonymize), otherwise the search would reveal names.
const filteredPeople = computed<AppPerson[]>(() => {
  const query = searchQuery.value.trim()
  return allPeople.value
    .filter(person => !familyName.value || anon.surnames(person).includes(familyName.value))
    .filter(person => !query || anon.matchesName(person, query) || !!person.lifespan?.toLowerCase().includes(query.toLowerCase()))
    .map(person => ({ person, key: anon.sortKey(person) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(entry => entry.person)
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

// The whole tree, not just the people matching the search
const exportGedcom = async () => {
  try {
    const result = await gedcomStore.downloadGedcom()
    if (result.missing.length) window.alert(t('tree.exportMissing', { n: result.missing.length }))
  } catch (error: any) {
    window.alert(t('tree.exportFailed', { error: error?.data?.statusMessage || error?.message || '' }))
  }
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

const treeRelations = computed(() => {
  const personId = rootPersonId.value || selectedPerson.value?.id || allPeople.value[0]?.id
  const file = gedcomStore.state.value.file
  if (!personId || !file) return { personId: '', parents: [] as string[], partners: [] as string[], children: [] as string[] }
  const individual = file.individuals.get(personId)
  if (!individual) return { personId: '', parents: [], partners: [], children: [] }

  const parentFamilies = individual.familiesAsChild.map(id => file.families.get(id)).filter(Boolean)
  const parents = [...new Set(parentFamilies.flatMap(family => [family!.husband, family!.wife].filter((id): id is string => Boolean(id))))]
  const partnerFamilies = individual.familiesAsSpouse.map(id => file.families.get(id)).filter(Boolean)
  const partners = [...new Set(partnerFamilies.map(family => family!.husband === personId ? family!.wife : family!.husband).filter((id): id is string => Boolean(id)))]
  const children = [...new Set(partnerFamilies.flatMap(family => family!.children))]
  return { personId, parents, partners, children }
})

const descendantGenerations = computed(() => {
  const file = gedcomStore.state.value.file
  const startId = treeRelations.value.personId
  if (!file || !startId) return [] as string[][]
  const generations: string[][] = [[startId]]
  const visited = new Set([startId])
  for (let depth = 0; depth < treeSettings.value.maxGenerations - 1; depth++) {
    const next = generations[depth].flatMap(id => {
      const person = file.individuals.get(id)
      return (person?.familiesAsSpouse || []).flatMap(familyId => file.families.get(familyId)?.children || [])
    }).filter(id => {
      if (visited.has(id) || !file.individuals.has(id)) return false
      visited.add(id)
      return true
    })
    if (!next.length) break
    generations.push(next)
  }
  return generations
})

const personName = (xrefId: string): string => {
  const person = gedcomStore.individuals.value.get(xrefId)
  return person?.names.length ? anon.personName(person) : xrefId
}

const selectById = (xrefId: string) => {
  const person = allPeople.value.find(candidate => candidate.id === xrefId)
  if (person) selectPerson(person)
}

const openPersonEditor = (person?: AppPerson) => (person ? editor.openEdit(person.id) : editor.openNew())


const saveChanges = async () => {
  try {
    await gedcomStore.saveNow()
  } catch (error) {
    window.alert(t('tree.savingFailed', { error: errorText(error) }))
  }
}

const errorText = (error: any): string => error?.data?.statusMessage || error?.message || t('tree.unknownError')

// Right-click menu of a row: the same actions as the buttons (PersonActionsMenu.vue); "Detail" selects the person
const menu = ref<{ person: AppPerson; x: number; y: number } | null>(null)
const openMenu = (person: AppPerson, event: MouseEvent) => { menu.value = { person, x: event.clientX, y: event.clientY } }
const detailById = (id: string) => selectById(id)

// After saving in the editor the saved person is shown in the detail
const onPersonSaved = (id: string) => {
  const savedPerson = gedcomStore.getAllAppPersons().find(person => person.id === id)
  if (savedPerson) selectPerson(savedPerson)
}

const deletePerson = async (person: AppPerson) => {
  if (!window.confirm(t('tree.confirmDelete', { name: person.fullName }))) return
  try {
    await gedcomStore.removePerson(person.id)
    selectedPerson.value = null
    rootPersonId.value = null
  } catch (error) {
    window.alert(t('tree.deletingFailed', { error: errorText(error) }))
  }
}
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        {{ t('tree.title') }}
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        {{ t('tree.subtitle') }}
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
          {{ t('tree.view.tree') }}
        </button>
        <button
          @click="setViewMode('chart')"
          class="px-4 py-2 rounded-lg transition-colors"
          :class="{
            'bg-primary-600 text-white': viewMode === 'chart',
            'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white': viewMode !== 'chart',
          }"
        >
          {{ t('tree.view.chart') }}
        </button>
        <button
          @click="setViewMode('list')"
          class="px-4 py-2 rounded-lg transition-colors"
          :class="{
            'bg-primary-600 text-white': viewMode === 'list',
            'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white': viewMode !== 'list',
          }"
        >
          {{ t('tree.view.list') }}
        </button>
      </div>
      
      <div class="relative flex-1 min-w-64">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('tree.search')"
          class="w-full px-4 py-2 rounded-lg border transition-colors"
          :class="{
            'bg-gray-800 border-gray-600 text-white': isDark,
            'bg-white border-gray-200 text-gray-900': !isDark,
          }"
        >
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      </div>

      <select
        v-if="familyNames.length"
        v-model="familyName"
        class="px-3 py-2 rounded-lg border max-w-full"
        :class="{ 'bg-gray-800 border-gray-600 text-white': isDark, 'bg-white border-gray-200 text-gray-900': !isDark }"
        :aria-label="t('tree.familyName.label')"
        data-family-name
      >
        <option value="">{{ t('tree.familyName.all') }}</option>
        <option v-for="entry in familyNames" :key="entry.name" :value="entry.name">{{ entry.name }} ({{ entry.count }})</option>
      </select>
      
      <template v-if="adminAuth.canEdit.value">
        <button
          v-if="gedcomStore.state.value.dirty"
          @click="saveChanges"
          class="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium"
        >
          {{ t('tree.saveToServer') }}
        </button>
        <button
          @click="importGedcom"
          class="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
        >
          {{ t('tree.importGedcom') }}
        </button>
        <button
          @click="openPersonEditor()"
          class="px-5 py-3 border border-gray-300 dark:border-gray-600 rounded-lg font-medium"
        >
          {{ t('tree.addPerson') }}
        </button>
      </template>
    </div>

    <div v-if="!gedcomStore.hasData.value" class="p-12 text-center rounded-lg" :class="{ 'bg-gray-800': isDark, 'bg-gray-100': !isDark }">
      <div class="text-4xl mb-4">🌳</div>
      <h3 class="text-xl font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        {{ t('tree.empty.title') }}
      </h3>
      <p class="text-lg opacity-75 mb-6" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        {{ t('tree.empty.text') }}
      </p>
      <button
        v-if="adminAuth.canEdit.value"
        @click="importGedcom"
        class="px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium text-lg"
      >
        {{ t('tree.empty.import') }}
      </button>
    </div>

    <div v-else>
      <!-- Statistics Card -->
      <div class="mb-6 p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
        <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
          {{ t('tree.stats.title') }}
          <span v-if="!gedcomStore.hasData.value" class="text-xs text-red-500 ml-2">[DEBUG: No data - check console]</span>
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ gedcomStore.totalIndividuals.value }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              {{ t('tree.stats.individuals') }}
            </div>
          </div>
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ gedcomStore.totalFamilies.value }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              {{ t('tree.stats.families') }}
            </div>
          </div>
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ treeStats.generations }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              {{ t('tree.stats.generations') }}
            </div>
          </div>
          <div class="p-4 rounded-lg" :class="{ 'bg-gray-700': isDark, 'bg-gray-100': !isDark }">
            <div class="text-2xl font-bold" :class="{ 'text-primary-400': isDark, 'text-primary-600': !isDark }">
              {{ allPeople.length }}
            </div>
            <div class="text-sm opacity-75 mt-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              {{ t('tree.stats.totalPeople') }}
            </div>
          </div>
        </div>
      </div>

      <!-- List View -->
      <div v-if="viewMode === 'list'" class="overflow-x-auto">
        <div v-if="adminAuth.canRead.value" class="mb-4 flex justify-end">
          <button
            @click="exportGedcom"
            :title="t('tree.exportHint')"
            class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm font-medium"
          >
            {{ t('tree.export') }}
          </button>
        </div>
        <table class="w-full">
          <thead class="border-b">
            <tr :class="{ 'border-gray-700': isDark, 'border-gray-200': !isDark }">
              <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                {{ t('tree.col.name') }}
              </th>
              <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                {{ t('tree.col.lifespan') }}
              </th>
              <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                {{ t('tree.col.generation') }}
              </th>
              <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                {{ t('tree.col.sex') }}
              </th>
              <th class="text-left p-4 font-bold" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                {{ t('tree.col.actions') }}
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
              @contextmenu.prevent="openMenu(person, $event)"
            >
              <td class="p-4">
                <div class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  {{ anon.personName(person) }}
                </div>
                <div v-if="person.isRoot" class="text-xs opacity-60">{{ t('tree.root') }}</div>
              </td>
              <td class="p-4">
                <LifespanTips :person="person" />
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
                  {{ person.sex === 'M' ? t('tree.sex.male') : person.sex === 'F' ? t('tree.sex.female') : t('tree.sex.unknown') }}
                </span>
              </td>
              <td class="p-4">
                <button
                  @click.stop="selectAsRoot(person)"
                  class="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded hover:bg-primary-200 dark:hover:bg-primary-800/30 transition-colors"
                >
                  {{ t('tree.setAsRoot') }}
                </button>
                <template v-if="adminAuth.canEdit.value">
                  <button @click.stop="openPersonEditor(person)" class="ml-2 text-xs underline">{{ t('tree.edit') }}</button>
                  <button @click.stop="deletePerson(person)" class="ml-2 text-xs text-red-600 underline">{{ t('tree.delete') }}</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        
        <div v-if="filteredPeople.length === 0" class="text-center py-12">
          <p class="opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
            {{ t('tree.noResults') }}
          </p>
        </div>
      </div>

      <div v-if="viewMode === 'tree'" class="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
        <section class="p-5 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700">
          <h3 class="font-semibold mb-3">{{ t('tree.parents') }}</h3>
          <button v-for="id in treeRelations.parents" :key="id" @click="selectById(id)" class="block w-full text-left py-2 px-3 mb-2 rounded bg-gray-50 dark:bg-gray-700 hover:ring-2 ring-primary-500">
            {{ personName(id) }}
          </button>
          <p v-if="!treeRelations.parents.length" class="text-sm opacity-60">{{ t('tree.noParents') }}</p>
        </section>
        <section class="p-5 rounded-lg border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-center">
          <h3 class="font-semibold">{{ personName(treeRelations.personId) }}</h3>
          <p class="text-sm opacity-70 mt-1">{{ t('tree.selectedPerson') }}</p>
          <button v-if="treeRelations.personId" @click="selectById(treeRelations.personId)" class="mt-3 text-sm underline">{{ t('tree.viewDetails') }}</button>
        </section>
        <section class="p-5 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700">
          <h3 class="font-semibold mb-3">{{ t('tree.partnersChildren') }}</h3>
          <button v-for="id in treeRelations.partners" :key="id" @click="selectById(id)" class="block w-full text-left py-2 px-3 mb-2 rounded bg-gray-50 dark:bg-gray-700 hover:ring-2 ring-primary-500">
            {{ personName(id) }} <span class="text-xs opacity-60">{{ t('tree.partner') }}</span>
          </button>
          <button v-for="id in treeRelations.children" :key="id" @click="selectById(id)" class="block w-full text-left py-2 px-3 mb-2 rounded bg-gray-50 dark:bg-gray-700 hover:ring-2 ring-primary-500">
            {{ personName(id) }} <span class="text-xs opacity-60">{{ t('tree.child') }}</span>
          </button>
          <p v-if="!treeRelations.partners.length && !treeRelations.children.length" class="text-sm opacity-60">{{ t('tree.noPartnersChildren') }}</p>
        </section>
      </div>

      <div v-if="viewMode === 'chart'" class="overflow-x-auto py-4">
        <div class="flex min-w-max items-start gap-6">
          <section v-for="(generation, index) in descendantGenerations" :key="index" class="w-56">
            <h3 class="text-sm font-semibold mb-3">{{ index === 0 ? t('tree.root') : t('tree.generationN', { n: index }) }}</h3>
            <button v-for="id in generation" :key="id" @click="selectById(id)" class="block w-full text-left p-3 mb-2 rounded border bg-white dark:bg-gray-800 dark:border-gray-700 hover:border-primary-500">
              <span class="block font-medium">{{ personName(id) }}</span>
              <span class="text-xs opacity-60">{{ anon.date(gedcomStore.individuals.value.get(id)?.birth?.date?.raw || '') }}</span>
            </button>
          </section>
        </div>
      </div>

      <!-- Selected Person Details -->
      <div v-if="selectedPerson" class="relative mt-8 p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
        <button
          @click="clearSelection"
          class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300"
        >
          ×
        </button>
        <div v-if="adminAuth.canEdit.value" class="absolute top-4 right-14 flex gap-3 text-sm">
          <button @click="deletePerson(selectedPerson)" class="text-red-600 underline">{{ t('tree.delete') }}</button>
        </div>
        
        <div class="flex items-start gap-6">
          <div class="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg" :style="{ backgroundColor: getPersonColor(selectedPerson) }">
            <span class="text-white">
              {{ selectedPerson.sex === 'M' ? '👨' : selectedPerson.sex === 'F' ? '👩' : '👤' }}
            </span>
          </div>
          
          <div class="flex-1">
            <h2 class="text-2xl font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ anon.personName(selectedPerson) }}
            </h2>
            <PersonActions :editor="editor" :person-id="selectedPerson.id" class="mb-4" />
            
            <div v-if="treeSettings.showDetails" class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ t('tree.col.lifespan') }}
                </div>
                <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  <LifespanTips :person="selectedPerson" />
                  <span v-if="selectedLiving" class="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700" data-living>{{ selectedLiving }}</span>
                </div>
              </div>
              <div>
                <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ t('tree.col.generation') }}
                </div>
                <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  {{ selectedPerson.generation }}
                </div>
              </div>
              <div>
                <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ t('tree.col.sex') }}
                </div>
                <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  {{ selectedPerson.sex === 'M' ? t('tree.sex.male') : selectedPerson.sex === 'F' ? t('tree.sex.female') : t('tree.sex.unknown') }}
                </div>
              </div>
            </div>
            
            <div v-if="treeSettings.showDetails && selectedGeoEvents.length" class="mt-4">
              <div class="opacity-60 text-sm mb-2" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                {{ t('tree.geoEvents') }}
              </div>
              <div class="flex gap-2 flex-wrap">
                <HoverTip v-for="event in selectedGeoEvents" :key="event.key" :text="placeTip(event.place)">
                  <span class="block cursor-help px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs">
                    {{ eventLabel(event.type) }}
                  </span>
                </HoverTip>
              </div>
            </div>

            <div v-if="selectedArchiveMaps.length" class="mt-4" data-archive-maps>
              <div class="opacity-60 text-sm mb-2" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                {{ t('tree.archiveMaps') }}
              </div>
              <div v-for="entry in selectedArchiveMaps" :key="entry.place" class="mb-2">
                <div class="text-sm font-medium">{{ entry.place }}</div>
                <ArchiveMapLinks :maps="entry.maps" :show-source="entry === selectedArchiveMaps.at(-1)" />
              </div>
            </div>

            <PersonSources :file="gedcomStore.state.value.file" :person-id="selectedPerson.id" class="mt-4" />
            <PersonLinks :file="gedcomStore.state.value.file" :person-id="selectedPerson.id" class="mt-4" />
          </div>
        </div>
      </div>
    </div>

    <PersonEditor v-if="editor.isOpen.value && adminAuth.canEdit.value" :editor="editor" @saved="onPersonSaved" />
    <PersonActionsMenu
      v-if="menu"
      :key="`${menu.person.id}-${menu.x}-${menu.y}`"
      :editor="editor"
      :person-id="menu.person.id"
      :title="anon.personName(menu.person)"
      :x="menu.x"
      :y="menu.y"
      detail
      @detail="detailById"
      @close="menu = null"
    />
  </div>
</template>
