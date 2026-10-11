<script setup lang="ts">
import { useColorMode } from '#imports'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const mapReady = ref(false)
const mapInstance = ref<any>(null)
const center = ref<[number, number]>([50.0755, 14.4378])
const zoom = ref(7)

const eventTypes = {
  BIRT: { color: '#22c55e', icon: '👶', label: 'Birth' },
  CHR: { color: '#22c55e', icon: '👶', label: 'Christening' },
  DEAT: { color: '#ef4444', icon: '⚰️', label: 'Death' },
  BURI: { color: '#ef4444', icon: '⚰️', label: 'Burial' },
  CREM: { color: '#ef4444', icon: '⚰️', label: 'Cremation' },
  MARR: { color: '#3b82f6', icon: '💍', label: 'Marriage' },
  DIV: { color: '#3b82f6', icon: '💔', label: 'Divorce' },
  ENG: { color: '#3b82f6', icon: '💍', label: 'Engagement' },
}

const showBirth = ref(true)
const showMarriage = ref(true)
const showDeath = ref(true)
const showOther = ref(true)
const showMigration = ref(false)
const showClusters = ref(true)

const selectedEvent = ref<any>(null)
const infoWindowPosition = ref<[number, number] | null>(null)

const mapEvents = ref([
  {
    id: 'event-1',
    personId: '1',
    personName: 'Jan Novák',
    type: 'BIRT',
    date: '12 May 1850',
    place: 'Prague, Czech Republic',
    description: 'Birth of Jan Novák',
    coordinates: [50.0755, 14.4378],
    color: '#22c55e',
    icon: '👶',
  },
  {
    id: 'event-2',
    personId: '1',
    personName: 'Jan Novák',
    type: 'DEAT',
    date: '15 Mar 1920',
    place: 'Prague, Czech Republic',
    description: 'Death of Jan Novák',
    coordinates: [50.0755, 14.4378],
    color: '#ef4444',
    icon: '⚰️',
  },
  {
    id: 'event-3',
    personId: '2',
    personName: 'Marie Nováková',
    type: 'BIRT',
    date: '25 Dec 1855',
    place: 'Brno, Czech Republic',
    description: 'Birth of Marie Nováková',
    coordinates: [49.1951, 16.6068],
    color: '#22c55e',
    icon: '👶',
  },
  {
    id: 'event-4',
    personId: '2',
    personName: 'Marie Nováková',
    type: 'DEAT',
    date: '20 Sep 1930',
    place: 'Prague, Czech Republic',
    description: 'Death of Marie Nováková',
    coordinates: [50.0755, 14.4378],
    color: '#ef4444',
    icon: '⚰️',
  },
])

const filteredEvents = computed(() => {
  return mapEvents.value.filter(event => {
    if (event.type === 'BIRT' && !showBirth.value) return false
    if (event.type === 'MARR' && !showMarriage.value) return false
    if (event.type === 'DEAT' && !showDeath.value) return false
    if (event.type === 'BURI' && !showDeath.value) return false
    if (!['BIRT', 'MARR', 'DEAT', 'BURI'].includes(event.type) && !showOther.value) return false
    return true
  })
})

const initMap = () => {
  if (typeof window !== 'undefined' && (window as any).L) {
    const L = (window as any).L
    mapInstance.value = L.map('map-container').setView(center.value, zoom.value)
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(mapInstance.value)
    
    updateMapMarkers()
    
    if (filteredEvents.value.length > 0) {
      const bounds = L.latLngBounds(
        filteredEvents.value.map(e => [e.coordinates[0], e.coordinates[1]])
      )
      mapInstance.value.fitBounds(bounds, { padding: [50, 50] })
    }
    
    mapReady.value = true
  }
}

const updateMapMarkers = () => {
  if (!mapInstance.value) return
  const L = (window as any).L
  
  mapInstance.value.eachLayer((layer: any) => {
    if (layer instanceof L.Marker) {
      mapInstance.value.removeLayer(layer)
    }
  })
  
  filteredEvents.value.forEach(event => {
    const marker = L.marker([event.coordinates[0], event.coordinates[1]], {
      icon: L.divIcon({
        html: `<div style="background-color: ${event.color}; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: white; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${event.icon}</div>`,
        className: 'custom-marker-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(mapInstance.value)
    
    const popupContent = `
      <div style="min-width: 200px; padding: 8px;">
        <div style="font-weight: bold; margin-bottom: 4px;">${event.icon} ${eventTypes[event.type]?.label || event.type}</div>
        <div style="margin-bottom: 4px;">${event.personName}</div>
        <div style="color: #666; font-size: 12px; margin-bottom: 4px;">${event.date || 'N/A'}</div>
        <div style="color: #666; font-size: 12px;">${event.place || 'N/A'}</div>
      </div>
    `
    marker.bindPopup(popupContent)
    
    marker.on('click', () => {
      selectedEvent.value = event
      infoWindowPosition.value = [event.coordinates[0], event.coordinates[1]]
    })
  })
  
  if (showMigration.value) {
    addMigrationLines()
  }
}

const addMigrationLines = () => {
  if (!mapInstance.value) return
  const L = (window as any).L
  const personEvents = new Map()
  filteredEvents.value.forEach(event => {
    if (!personEvents.has(event.personId)) {
      personEvents.set(event.personId, [])
    }
    personEvents.get(event.personId).push(event)
  })
  
  personEvents.forEach((events: any[], personId: string) => {
    if (events.length < 2) return
    for (let i = 0; i < events.length - 1; i++) {
      const start = events[i]
      const end = events[i + 1]
      L.polyline(
        [start.coordinates, end.coordinates],
        {
          color: eventTypes[start.type]?.color || '#666',
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

watch([showBirth, showMarriage, showDeath, showOther, showMigration], () => {
  if (mapReady.value) updateMapMarkers()
}, { deep: true })

watch(() => filteredEvents.value, () => {
  if (mapReady.value) updateMapMarkers()
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
        Map Visualization
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        Explore your family history on the map
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div class="lg:col-span-1 space-y-4">
        <div class="p-4 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
          <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            Event Filters
          </h3>
          <div class="space-y-3">
            <label class="flex items-center">
              <input v-model="showBirth" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">Birth/Christening</span>
            </label>
            <label class="flex items-center">
              <input v-model="showMarriage" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">Marriage/Engagement</span>
            </label>
            <label class="flex items-center">
              <input v-model="showDeath" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">Death/Burial</span>
            </label>
            <label class="flex items-center">
              <input v-model="showOther" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">Other Events</span>
            </label>
            <label class="flex items-center">
              <input v-model="showMigration" type="checkbox" class="mr-3">
              <span :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">Migration Lines</span>
            </label>
          </div>
        </div>
      </div>
      
      <div class="lg:col-span-3 relative">
        <div v-if="!mapReady" class="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
          <div class="text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
            <p :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">Loading map...</p>
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
                {{ eventTypes[selectedEvent.type]?.label || selectedEvent.type }}
              </h3>
            </div>
            <div class="mb-1 font-medium" :class="{ 'text-gray-700': !isDark, 'text-gray-200': isDark }">
              {{ selectedEvent.personName }}
            </div>
            <div v-if="selectedEvent.date" class="text-sm opacity-75 mb-1">
              Date: {{ selectedEvent.date }}
            </div>
            <div v-if="selectedEvent.place" class="text-sm opacity-75">
              Location: {{ selectedEvent.place }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
