<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import type { MapEvent } from '~~/types/gedcom'
import { useSettings } from '~~/composables/useSettings'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

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
// shallowRef: a deep ref would wrap the Leaflet map in a reactive proxy, which breaks leaflet.markercluster
const mapInstance = shallowRef<any>(null)
// Marker layer (a cluster group or a plain layer group); replaced on every refresh
let markerLayer: any = null
const center = ref<[number, number]>([50.0755, 14.4378])
const zoom = ref(appSettings.settings.value.map.defaultZoom)

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
  if (mapInstance.value && filteredEvents.value.length === 0) mapInstance.value.setView(center.value, zoom.value)
}
if (appSettings.ready.value) applyMapSettings()
else watch(appSettings.ready, (ready) => { if (ready) applyMapSettings() }, { once: true })

const selectedPersonId = ref('')
const personScope = ref<'all' | 'person' | 'family'>('all')
const startYear = ref('')
const endYear = ref('')

const selectedEvent = ref<MapEvent | null>(null)
const infoWindowPosition = ref<[number, number] | null>(null)

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

// Moves the map to the events once; returns false while there are none yet (the data may load after the map)
let fitted = false
const fitToEvents = (): boolean => {
  if (!mapInstance.value || filteredEvents.value.length === 0) return false
  const L = (window as any).L
  const points = filteredEvents.value.map(e => [e.coordinates[0], e.coordinates[1]] as [number, number])
  const onePlace = points.every(point => point[0] === points[0][0] && point[1] === points[0][1])
  // fitBounds on a single place would zoom in as far as possible; use the default zoom instead
  if (onePlace) mapInstance.value.setView(points[0], zoom.value)
  else mapInstance.value.fitBounds(L.latLngBounds(points), { padding: [50, 50] })
  return true
}

const initMap = () => {
  if (typeof window !== 'undefined' && (window as any).L) {
    const L = (window as any).L
    mapInstance.value = L.map('map-container').setView(center.value, zoom.value)
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapInstance.value)
    
    fitted = fitToEvents()

    // Markers go in after the final view is set: leaflet.markercluster loses its markers when the view
    // jumps many zoom levels (e.g. default zoom 18 -> fit to the events) while it already holds them
    updateMapMarkers()
    
    mapReady.value = true
  }
}

const updateMapMarkers = () => {
  if (!mapInstance.value) return
  const L = (window as any).L
  
  if (markerLayer) mapInstance.value.removeLayer(markerLayer)
  mapInstance.value.eachLayer((layer: any) => {
    if (layer instanceof L.Polyline) {
      mapInstance.value.removeLayer(layer)
    }
  })
  // Clusters need the leaflet.markercluster script (loaded in nuxt.config); without it plain markers are shown
  markerLayer = showClusters.value && L.markerClusterGroup ? L.markerClusterGroup() : L.layerGroup()
  
  filteredEvents.value.forEach(event => {
    const config = eventTypeConfig[event.type as keyof typeof eventTypeConfig] || { color: '#9ca3af', icon: '⚪' }
    
    const marker = L.marker([event.coordinates[0], event.coordinates[1]], {
      icon: L.divIcon({
        html: `<div style="background-color: ${config.color}; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: white; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${config.icon}</div>`,
        className: 'custom-marker-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(markerLayer)
    
    const popupContent = `
      <div style="min-width: 200px; padding: 8px;">
        <div style="font-weight: bold; margin-bottom: 4px;">${config.icon} ${eventLabel(event.type)}</div>
        <div style="margin-bottom: 4px;">${anon.name(event.personName)}</div>
        <div style="color: #666; font-size: 12px; margin-bottom: 4px;">${anon.date(event.date) || t('map.na')}</div>
        <div style="color: #666; font-size: 12px;">${anon.place(event.place) || t('map.na')}</div>
      </div>
    `
    marker.bindPopup(popupContent)
    
    marker.on('click', () => {
      selectedEvent.value = event
      infoWindowPosition.value = [event.coordinates[0], event.coordinates[1]]
    })
  })
  
  markerLayer.addTo(mapInstance.value)

  if (showMigration.value) {
    addMigrationLines()
  }
}

const addMigrationLines = () => {
  if (!mapInstance.value) return
  const L = (window as any).L
  const personEvents = new Map<string, MapEvent[]>()
  
  filteredEvents.value.forEach(event => {
    if (!personEvents.has(event.personId)) {
      personEvents.set(event.personId, [])
    }
    personEvents.get(event.personId)!.push(event)
  })
  
  personEvents.forEach((events: MapEvent[], personId: string) => {
    if (events.length < 2) return
    
    // Sort events by date if possible, otherwise by coordinates
    const sortedEvents = [...events].sort((a, b) => {
      if (a.date && b.date) {
        const yearA = Number(a.date.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0])
        const yearB = Number(b.date.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0])
        if (yearA && yearB) return yearA - yearB
        return a.date.localeCompare(b.date)
      }
      return 0
    })
    
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const start = sortedEvents[i]
      const end = sortedEvents[i + 1]
      
      L.polyline(
        [[start.coordinates[0], start.coordinates[1]], [end.coordinates[0], end.coordinates[1]]],
        {
          color: eventTypeConfig[start.type as keyof typeof eventTypeConfig]?.color || '#666',
          weight: 2,
          opacity: 0.7,
          dashArray: '5, 5',
        }
      ).addTo(mapInstance.value)
    }
  })
}

const closeInfoWindow = () => {
  selectedEvent.value = null
  infoWindowPosition.value = null
}

const handleResize = () => {
  if (mapInstance.value) {
    setTimeout(() => {
      mapInstance.value.invalidateSize()
    }, 100)
  }
}

const importGedcom = () => {
  router.push('/gedcom')
}

// Watch for changes in filters and data
watch([showBirth, showMarriage, showDeath, showOther, showMigration, showClusters, () => appSettings.settings.value.language], () => {
  if (mapReady.value) updateMapMarkers()
}, { deep: true })

watch(() => filteredEvents.value, () => {
  if (!mapReady.value) return
  if (!fitted) fitted = fitToEvents()
  updateMapMarkers()
}, { deep: true })

watch(() => gedcomStore.hasData.value, () => {
  if (gedcomStore.hasData.value && mapReady.value) {
    updateMapMarkers()
  }
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    initMap()
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (mapInstance.value) {
    mapInstance.value.remove()
    mapInstance.value = null
  }
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
                <option v-for="person in gedcomStore.getAllAppPersons()" :key="person.id" :value="person.id">{{ anon.name(person.fullName) }}</option>
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
        
        <div id="map-container" class="h-[70vh] lg:h-[80vh] rounded-lg shadow-lg"></div>
        
        <div
          v-if="selectedEvent && infoWindowPosition"
          class="absolute bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm"
          :style="{ transform: 'translate(-50%, -100%)', top: '0', left: '50%' }"
        >
          <button
            @click="closeInfoWindow"
            class="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300"
          >
            ×
          </button>
          <div class="pr-6">
            <div class="flex items-center mb-2">
              <span class="text-2xl mr-2">{{ selectedEvent.icon }}</span>
              <h3 class="font-bold text-lg" :class="{ 'text-gray-900': !isDark, 'text-white': isDark }">
                {{ eventLabel(selectedEvent.type) }}
              </h3>
            </div>
            <div class="mb-1 font-medium" :class="{ 'text-gray-700': !isDark, 'text-gray-200': isDark }">
              {{ anon.name(selectedEvent.personName) }}
            </div>
            <div v-if="anon.date(selectedEvent.date)" class="text-sm opacity-75 mb-1">
              {{ t('map.date', { value: anon.date(selectedEvent.date) }) }}
            </div>
            <div v-if="anon.place(selectedEvent.place)" class="text-sm opacity-75">
              {{ t('map.location', { value: anon.place(selectedEvent.place) }) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
