<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import type { MapEvent } from '~~/types/gedcom'
import { useSettings } from '~~/composables/useSettings'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useT } from '~~/composables/useT'
import { useKnownLocations } from '~~/composables/useKnownLocations'
import type { MessageKey } from '~~/i18n'
import { BASE_LAYERS, HISTORIC_LAYERS, OVERLAY_LAYERS } from '~~/utils/map/layers'
import { useMapLayers } from '~~/composables/useMapLayers'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { customLayerId, isCustomLayerId } from '~~/utils/map/mapLayers'
import type { ResolvedOverlay } from '~/components/EventMap.client.vue'

const { t } = useT()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const gedcomStore = useGedcomStore()
const appSettings = useSettings()
const anon = useAnonymize()
const router = useRouter()

// Ensure data is loaded when visiting /map directly
onMounted(async () => {
  if (!gedcomStore.hasData.value) {
    await gedcomStore.refreshFromServer()
  }
})

const mapReady = ref(false)
// The OpenLayers map (EventMap.client.vue): markers, clusters, layers; this page keeps filters and the detail panel
const eventMap = ref<{ reveal: (id: string) => Promise<void>; goTo: (id: string) => void; container: () => HTMLElement | null } | null>(null)
const zoom = ref(appSettings.settings.value.map.defaultZoom)
// Layer choice is remembered in the settings
const mapSettings = computed(() => appSettings.settings.value.map)

// Event type filters
const showBirth = ref(true)
const showMarriage = ref(true)
const showDeath = ref(true)
const showOther = ref(true)
const showMigration = ref(appSettings.settings.value.map.showMigrationLines)
const showClusters = ref(appSettings.settings.value.map.showClusters)
// The map settings give the initial values; the checkboxes on this page change them for this visit only
const applyMapSettings = () => {
  const { map } = appSettings.settings.value
  showMigration.value = map.showMigrationLines
  showClusters.value = map.showClusters
  zoom.value = map.defaultZoom
}
if (appSettings.ready.value) applyMapSettings()
else watch(appSettings.ready, (ready) => { if (ready) applyMapSettings() }, { once: true })

const selectedPersonId = ref('')
const personScope = ref<'all' | 'person' | 'family'>('all')
const startYear = ref('')
const endYear = ref('')

const selectedEvent = ref<MapEvent | null>(null)
// Archive map links in the detail panel (administrator only)
const knownLocations = useKnownLocations()
knownLocations.autoLoad()
const adminAuth = useAdminAuth()

// Custom layers of uploaded sheets (Admin → Map layers), offered among the historical maps to the administrator.
// Only layers with a sheet are offered; the images are fetched with the admin token, so only for the chosen layer.
const mapLayers = useMapLayers()
mapLayers.autoLoad()
const customLayers = computed(() => (mapLayers.layers.value || []).filter(layer => layer.sheets.length))
const chosenCustomLayer = computed(() => customLayers.value.find(layer => customLayerId(layer) === mapSettings.value.historicLayer) ?? null)
// The select shows "none" for a custom layer that is not available (visitor, deleted layer); the setting stays, so
// the layer comes back after logging in
const historicChoice = computed({
  get: () => (isCustomLayerId(mapSettings.value.historicLayer) && !chosenCustomLayer.value ? 'none' : mapSettings.value.historicLayer),
  set: (value: string) => { appSettings.settings.value.map.historicLayer = value },
})
const resolvedOverlays = ref<ResolvedOverlay[]>([])
let overlayRequest = 0
watch(chosenCustomLayer, async (layer) => {
  const request = ++overlayRequest
  if (!layer) { resolvedOverlays.value = []; return }
  try {
    const sheets = await mapLayers.resolveSheets(layer)
    if (request === overlayRequest) resolvedOverlays.value = sheets.map(sheet => ({ id: sheet.id, width: sheet.width, height: sheet.height, points: sheet.points, url: sheet.url }))
  } catch (error) {
    console.error('[MAP LAYERS] Sheet images could not be loaded:', error)
  }
}, { immediate: true })
// Archive map sheets of a place for the list of events at one spot and the right-click popup; hidden with the places
const archiveMapsFor = (place?: string) => (anon.enabled.value ? [] : knownLocations.archiveMapsFor(place))

// Get map events from store
const mapEvents = computed<MapEvent[]>(() => {
  return gedcomStore.getMapEvents()
})

const eventTypeConfig = {
  BIRT: { color: '#22c55e', icon: '👶', category: 'birth' },
  CHR: { color: '#22c55e', icon: '👶', category: 'birth' },
  BAPM: { color: '#22c55e', icon: '👶', category: 'birth' },
  DEAT: { color: '#ef4444', icon: '⚰️', category: 'death' },
  BURI: { color: '#ef4444', icon: '⚰️', category: 'death' },
  CREM: { color: '#ef4444', icon: '⚰️', category: 'death' },
  MARR: { color: '#3b82f6', icon: '💍', category: 'marriage' },
  DIV: { color: '#9333ea', icon: '💔', category: 'marriage' },
  ENGA: { color: '#3b82f6', icon: '💍', category: 'marriage' },
  CENS: { color: '#f59e0b', icon: '📄', category: 'other' },
  RESI: { color: '#06b6d4', icon: '🏠', category: 'other' },
  OCCU: { color: '#64748b', icon: '💼', category: 'other' },
  EDUC: { color: '#8b5cf6', icon: '🎓', category: 'other' },
  EMIG: { color: '#10b981', icon: '✈️', category: 'other' },
  IMMI: { color: '#10b981', icon: '✈️', category: 'other' },
  MILI: { color: '#ea580c', icon: '🎖️', category: 'other' },
  RELI: { color: '#8b5cf6', icon: '⛪', category: 'other' },
  EVEN: { color: '#9ca3af', icon: '⚪', category: 'other' },
  FACT: { color: '#9ca3af', icon: '⚪', category: 'other' },
}

const eventLabel = (type: string) =>
  type in eventTypeConfig ? t(`map.event.${type}` as MessageKey) : type
const eventStyle = (type: string) => eventTypeConfig[type as keyof typeof eventTypeConfig] || { color: '#9ca3af', icon: '⚪' }
// A line in the list of events at one spot on the map
const describeEvent = (event: MapEvent): string => {
  const person = gedcomStore.state.value.file?.individuals.get(event.personId)
  const name = person ? anon.personName(person) : anon.name(event.personName || '')
  const year = anon.date(event.date || '').match(/\b\d{4}\b/)?.[0]
  return [eventLabel(event.type), year, name].filter(Boolean).join(' · ')
}

type EventCategory = 'birth' | 'marriage' | 'death' | 'other'

const categoryFilters = computed<Record<EventCategory, boolean>>(() => ({
  birth: showBirth.value,
  marriage: showMarriage.value,
  death: showDeath.value,
  other: showOther.value
}))

const filteredPersonIds = computed(() => {
  const file = gedcomStore.state.value.file
  if (!file || !selectedPersonId.value || personScope.value === 'all') return null
  const included = new Set([selectedPersonId.value])
  if (personScope.value === 'family') {
    const queue = [selectedPersonId.value]
    while (queue.length) {
      const personId = queue.shift()!
      const person = file.individuals.get(personId)
      for (const familyId of person?.familiesAsSpouse || []) {
        for (const childId of file.families.get(familyId)?.children || []) {
          if (!included.has(childId)) {
            included.add(childId)
            queue.push(childId)
          }
        }
      }
    }
  }
  return included
})

const filteredEvents = computed(() => {
  return mapEvents.value.filter(event => {
    const config = eventTypeConfig[event.type as keyof typeof eventTypeConfig]
    if (config && !categoryFilters.value[config.category as EventCategory]) return false
    if (filteredPersonIds.value && !filteredPersonIds.value.has(event.personId)) return false
    const yearText = event.date?.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0]
    const year = yearText ? Number(yearText) : null
    if (startYear.value && (year === null || year < Number(startYear.value))) return false
    if (endYear.value && (year === null || year > Number(endYear.value))) return false
    return true
  })
})

// The events on the map, grouped by person: the detail panel lists a person's events and tells which relatives are on the map
const eventsByPerson = computed(() => {
  const groups = new Map<string, MapEvent[]>()
  for (const event of filteredEvents.value) groups.set(event.personId, [...(groups.get(event.personId) ?? []), event])
  return groups
})

// The map is taller than the window, and on phones it starts below the fold: the detail panel is kept inside the part
// of the map that is on screen, otherwise it would open out of sight at the map's bottom (phones) or top (desktop) edge
const panelInset = ref({ top: 12, bottom: 12, max: 0 })
const updatePanelInset = () => {
  const container = eventMap.value?.container()?.getBoundingClientRect()
  if (!container) return
  const gap = 12
  const visible = Math.min(container.bottom, window.innerHeight) - Math.max(container.top, 0)
  panelInset.value = {
    top: Math.max(0, -container.top) + gap,
    bottom: Math.max(0, container.bottom - window.innerHeight) + gap,
    max: Math.max(160, visible - 2 * gap),
  }
}
const panelStyle = computed(() => ({
  '--panel-top': `${panelInset.value.top}px`,
  '--panel-bottom': `${panelInset.value.bottom}px`,
  ...(panelInset.value.max ? { '--panel-max': `${panelInset.value.max}px` } : {}),
}))
const onViewportChange = () => {
  if (selectedEvent.value) updatePanelInset()
}

// Scrolls the page just enough to show the whole map when it fits in the window, so the panel and the marker both have room
const scrollMapIntoView = () => {
  const container = eventMap.value?.container()?.getBoundingClientRect()
  if (!container || container.height > window.innerHeight) return
  const delta = container.top < 0 ? container.top : Math.max(0, container.bottom - window.innerHeight)
  if (delta) window.scrollBy({ top: delta, behavior: 'instant' })
}

const selectEvent = (event: MapEvent, options: { reveal?: boolean } = {}) => {
  scrollMapIntoView()
  updatePanelInset()
  selectedEvent.value = event
  if (options.reveal !== false) eventMap.value?.reveal(event.id)
}

const closeDetail = () => {
  selectedEvent.value = null
}

// Selecting an event in the panel: show its marker (zooming out of a cluster if needed), then keep it clear of the panel
const goToEvent = (event: MapEvent) => {
  selectEvent(event, { reveal: false })
  eventMap.value?.goTo(event.id)
}

const focusPerson = (personId: string) => {
  const event = eventsByPerson.value.get(personId)?.[0]
  if (event) goToEvent(event)
}

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && selectedEvent.value) closeDetail()
}

const importGedcom = () => {
  router.push('/gedcom')
}

// The selected person's event may have been filtered out
watch(filteredEvents, (events) => {
  if (selectedEvent.value && !events.some(event => event.id === selectedEvent.value!.id)) closeDetail()
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onViewportChange, { passive: true })
  window.addEventListener('resize', onViewportChange)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onViewportChange)
  window.removeEventListener('resize', onViewportChange)
})
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        {{ t('map.title') }}
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        {{ t('map.subtitle') }}
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div class="lg:col-span-1 space-y-4">
        <div class="p-4 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
          <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('map.filters') }}
          </h3>
          <div class="space-y-3">
            <label class="flex items-center cursor-pointer">
              <input v-model="showBirth" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.filter.birth') }}</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input v-model="showMarriage" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.filter.marriage') }}</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input v-model="showDeath" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.filter.death') }}</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input v-model="showOther" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.filter.other') }}</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input v-model="showMigration" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.filter.migration') }}</span>
            </label>
            <label class="flex items-center cursor-pointer">
              <input v-model="showClusters" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.filter.clusters') }}</span>
            </label>
          </div>
          <div class="mt-5 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <label class="block text-sm font-medium">{{ t('map.personBranch') }}
              <select v-model="selectedPersonId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
                <option value="">{{ t('map.choosePerson') }}</option>
                <option v-for="person in gedcomStore.getAllAppPersons()" :key="person.id" :value="person.id">{{ anon.personName(person) }}</option>
              </select>
            </label>
            <select v-model="personScope" class="w-full rounded border px-3 py-2 bg-transparent" :disabled="!selectedPersonId">
              <option value="all">{{ t('map.scope.all') }}</option>
              <option value="person">{{ t('map.scope.person') }}</option>
              <option value="family">{{ t('map.scope.family') }}</option>
            </select>
            <div class="grid grid-cols-2 gap-2">
              <label class="text-sm">{{ t('map.fromYear') }}
                <input v-model="startYear" type="number" min="1" max="2100" :placeholder="t('map.any')" class="mt-1 w-full rounded border px-2 py-2 bg-transparent">
              </label>
              <label class="text-sm">{{ t('map.toYear') }}
                <input v-model="endYear" type="number" min="1" max="2100" :placeholder="t('map.any')" class="mt-1 w-full rounded border px-2 py-2 bg-transparent">
              </label>
            </div>
          </div>
        </div>
        
        <div class="p-4 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }" data-map-layers>
          <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('map.layers.title') }}
          </h3>
          <div class="space-y-3 text-sm">
            <label class="block font-medium">{{ t('map.layers.base') }}
              <select v-model="appSettings.settings.value.map.baseLayer" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" data-base-layer>
                <option v-for="layer in BASE_LAYERS" :key="layer.id" :value="layer.id">{{ t(layer.label as MessageKey) }}</option>
              </select>
            </label>
            <label class="block font-medium">{{ t('map.layers.historic') }}
              <select v-model="historicChoice" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" data-historic-layer>
                <option value="none">{{ t('map.layers.none') }}</option>
                <optgroup v-if="customLayers.length" :label="t('map.layers.custom')">
                  <option v-for="layer in customLayers" :key="layer.id" :value="customLayerId(layer)">{{ layer.title }}</option>
                </optgroup>
                <option v-for="layer in HISTORIC_LAYERS" :key="layer.id" :value="layer.id">{{ t(layer.label as MessageKey) }} ({{ layer.period }})</option>
              </select>
            </label>
            <NuxtLink v-if="adminAuth.isAdmin.value" to="/admin/layers" class="inline-block text-xs underline" data-manage-layers>{{ t('map.layers.manageCustom') }}</NuxtLink>
            <p v-if="mapSettings.historicLayer === 'cio'" class="text-xs opacity-70">{{ t('map.layers.cioHint') }}</p>
            <label v-if="historicChoice !== 'none'" class="block">
              {{ t('map.layers.opacity') }}: {{ mapSettings.historicOpacity }} %
              <input v-model.number="appSettings.settings.value.map.historicOpacity" type="range" min="0" max="100" step="5" class="mt-1 w-full" data-historic-opacity>
            </label>
            <label class="flex items-center cursor-pointer">
              <input v-model="appSettings.settings.value.map.placeNames" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('map.layers.names') }}</span>
            </label>
            <label v-for="layer in OVERLAY_LAYERS" :key="layer.id" class="flex items-center cursor-pointer">
              <input v-model="appSettings.settings.value.map.extraLayers" :value="layer.id" type="checkbox" class="mr-3" :data-extra-layer="layer.id">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t(layer.label as MessageKey) }}</span>
            </label>
            <p v-if="mapSettings.extraLayers.length" class="text-xs opacity-70">{{ t('map.layers.extraHint') }}</p>
          </div>
        </div>

        <div class="p-4 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
          <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('map.statistics') }}
          </h3>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('map.stat.events') }}</span>
              <span class="font-medium">{{ mapEvents.length }}</span>
            </div>
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('map.stat.filtered') }}</span>
              <span class="font-medium">{{ filteredEvents.length }}</span>
            </div>
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('map.stat.individuals') }}</span>
              <span class="font-medium">{{ gedcomStore.totalIndividuals.value }}</span>
            </div>
          </div>
        </div>
        
        <button
          @click="importGedcom"
          class="w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
        >
          {{ t('map.importFile') }}
        </button>
      </div>
      
      <div class="lg:col-span-3 relative">
        <div v-if="!mapReady" class="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">{{ t('map.loading') }}</p>
          </div>
        </div>
        
        <div v-if="!gedcomStore.hasData.value && mapReady" class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 rounded-lg">
          <div class="text-center p-8">
            <div class="text-4xl mb-4">🗺️</div>
            <h3 class="text-xl font-bold mb-2" :class="{ 'text-gray-800': !isDark, 'text-white': isDark }">
              {{ t('map.noData') }}
            </h3>
            <p class="opacity-75 mb-4" :class="{ 'text-gray-600': !isDark, 'text-gray-300': isDark }">
              {{ t('map.noDataHint') }}
            </p>
            <button
              @click="importGedcom"
              class="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
            >
              {{ t('map.import') }}
            </button>
          </div>
        </div>
        
        <EventMap
          id="map-container"
          ref="eventMap"
          class="h-[70vh] lg:h-[80vh] rounded-lg shadow-lg overflow-hidden"
          :events="filteredEvents"
          :selected-id="selectedEvent?.id ?? null"
          :clusters="showClusters"
          :migration="showMigration"
          :default-zoom="zoom"
          :base-layer="mapSettings.baseLayer"
          :historic-layer="mapSettings.historicLayer"
          :historic-opacity="mapSettings.historicOpacity"
          :place-names="mapSettings.placeNames"
          :extra-layers="mapSettings.extraLayers"
          :overlays="resolvedOverlays"
          :event-style="eventStyle"
          :describe="describeEvent"
          :archive-maps-for="archiveMapsFor"
          @select="selectEvent"
          @close="closeDetail"
          @ready="mapReady = true"
        />
        
        <MapPersonPanel
          v-if="selectedEvent"
          :style="panelStyle"
          :file="gedcomStore.state.value.file"
          :person-id="selectedEvent.personId"
          :selected-id="selectedEvent.id"
          :events-by-person="eventsByPerson"
          :event-label="eventLabel"
          @close="closeDetail"
          @select-event="goToEvent"
          @select-person="focusPerson"
        />
      </div>
    </div>
  </div>
</template>
