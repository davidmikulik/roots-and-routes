<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { parseCoordinatePair } from '~~/utils/gedcom/coordinates'
import type { KnownLocation } from '~~/types/locations'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const gedcomStore = useGedcomStore()
const adminAuth = useAdminAuth()
const locations = ref<KnownLocation[]>([])
const draft = reactive<{ name: string; latitude: number | null; longitude: number | null }>({
  name: '',
  latitude: null,
  longitude: null,
})
const isConnected = ref(false)
const isLoading = ref(false)
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

const getHeaders = () => adminAuth.authHeaders()

const loadLocations = async () => {
  if (!adminAuth.isAdmin.value) {
    isConnected.value = false
    return
  }
  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await $fetch<{ locations: KnownLocation[] }>('/api/admin/locations', { headers: getHeaders() })
    locations.value = response.locations.map(location => ({ ...location }))
    isConnected.value = true
  } catch (error: any) {
    isConnected.value = false
    errorMessage.value = error.data?.statusMessage || error.message || 'Unable to load locations.'
  } finally {
    isLoading.value = false
  }
}

// Load as soon as the admin token is known (restored after mount or entered above)
watch(() => adminAuth.isAdmin.value, isAdmin => { if (isAdmin) loadLocations() }, { immediate: true })

// Pasting "lat, lng" into either coordinate field fills both fields
const pasteCoordinates = (event: ClipboardEvent, target: { latitude: number | null; longitude: number | null }) => {
  const pair = parseCoordinatePair(event.clipboardData?.getData('text') || '')
  if (!pair) return
  event.preventDefault()
  target.latitude = pair[0]
  target.longitude = pair[1]
}

const addLocation = () => {
  const name = draft.name.trim().replace(/\s+/g, ' ')
  if (!name || draft.latitude === null || draft.longitude === null
    || !Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude)
    || Math.abs(draft.latitude) > 90 || Math.abs(draft.longitude) > 180) {
    errorMessage.value = 'Enter a location name, latitude between -90 and 90, and longitude between -180 and 180.'
    return
  }
  if (locations.value.some(location => location.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0)) {
    errorMessage.value = 'A location with this name already exists.'
    return
  }
  locations.value.push({ name, latitude: draft.latitude, longitude: draft.longitude })
  locations.value.sort((first, second) => first.name.localeCompare(second.name))
  draft.name = ''
  draft.latitude = null
  draft.longitude = null
  errorMessage.value = ''
}

const saveLocations = async () => {
  isSaving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await $fetch<{ count: number }>('/api/admin/locations', {
      method: 'PUT',
      headers: getHeaders(),
      body: { locations: locations.value },
    })
    const refreshedLocations = await gedcomStore.refreshLocationCoordinates(locations.value)
    successMessage.value = `Saved ${response.count} locations. Updated ${refreshedLocations} locations in the current tree.`
  } catch (error: any) {
    errorMessage.value = error.data?.statusMessage || error.message || 'Unable to save locations.'
  } finally {
    isSaving.value = false
  }
}

const exportLocations = (format: 'csv' | 'json') => {
  if (locations.value.length === 0) {
    errorMessage.value = 'No locations to export.'
    return
  }

  if (format === 'csv') {
    const headers = ['Name', 'Latitude', 'Longitude']
    const csvRows = locations.value.map(location => [
      `"${location.name.replace(/"/g, '""')}"`,
      location.latitude !== null ? location.latitude : '',
      location.longitude !== null ? location.longitude : ''
    ])
    const csvContent = [headers, ...csvRows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `locations-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } else {
    const jsonContent = JSON.stringify(locations.value, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `locations-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
  successMessage.value = `Exported ${locations.value.length} locations as ${format.toUpperCase()}.`
}

const parseCSV = (content: string): KnownLocation[] => {
  const lines = content.split('\n').filter(line => line.trim() !== '')
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'))
  const latIndex = headers.findIndex(h => h.toLowerCase().includes('latitude'))
  const lonIndex = headers.findIndex(h => h.toLowerCase().includes('longitude'))
  
  if (nameIndex === -1 || latIndex === -1 || lonIndex === -1) {
    throw new Error('CSV must contain Name, Latitude, and Longitude columns')
  }
  
  const result: KnownLocation[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const name = values[nameIndex]?.trim().replace(/^"|"$/g, '').replace(/""/g, '"') || ''
    const latitude = parseFloat(values[latIndex]?.trim() || '')
    const longitude = parseFloat(values[lonIndex]?.trim() || '')
    
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue
    
    result.push({ name, latitude, longitude })
  }
  return result
}

const parseJSON = (content: string): KnownLocation[] => {
  try {
    const data = JSON.parse(content)
    if (!Array.isArray(data)) return []
    
    return data.filter(item => {
      return item.name && 
             Number.isFinite(item.latitude) && 
             Number.isFinite(item.longitude) &&
             Math.abs(item.latitude) <= 90 && 
             Math.abs(item.longitude) <= 180
    }).map(item => ({
      name: String(item.name),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude)
    }))
  } catch {
    return []
  }
}

const triggerFileImport = () => {
  fileInput.value?.click()
}

const handleImport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  isImporting.value = true
  errorMessage.value = ''
  successMessage.value = ''
  
  try {
    const content = await file.text()
    let newLocations: KnownLocation[]
    
    if (file.name.endsWith('.csv')) {
      newLocations = parseCSV(content)
    } else if (file.name.endsWith('.json')) {
      newLocations = parseJSON(content)
    } else {
      errorMessage.value = 'Please upload a CSV or JSON file.'
      return
    }
    
    if (newLocations.length === 0) {
      errorMessage.value = 'No valid locations found in the file.'
      return
    }
    
    let addedCount = 0
    for (const newLoc of newLocations) {
      const exists = locations.value.some(loc => 
        loc.name.localeCompare(newLoc.name, undefined, { sensitivity: 'base' }) === 0
      )
      if (!exists) {
        locations.value.push(newLoc)
        addedCount++
      }
    }
    
    if (addedCount > 0) {
      locations.value.sort((first, second) => first.name.localeCompare(second.name))
      successMessage.value = `Imported ${addedCount} new locations. ${newLocations.length - addedCount} duplicates skipped.`
    } else {
      errorMessage.value = 'All locations in the file already exist.'
    }
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to import file.'
  } finally {
    isImporting.value = false
    input.value = ''
  }
}
</script>

<template>
  <div class="min-h-screen">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">Administration</p>
        <h1 class="mt-1 text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">Known locations</h1>
        <p class="mt-2 text-sm opacity-70">Manage place names and their latitude/longitude used during GEDCOM import.</p>
      </div>
      <NuxtLink to="/settings" class="text-sm underline">Back to settings</NuxtLink>
    </header>

    <section class="mb-6 rounded-lg border p-5" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
      <AdminLogin />
      <button v-if="adminAuth.isAdmin.value" type="button" :disabled="isLoading" class="mt-3 rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60" @click="loadLocations">
        {{ isLoading ? 'Loading…' : isConnected ? 'Reload locations' : 'Load locations' }}
      </button>
    </section>

    <p v-if="errorMessage" role="alert" class="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{{ errorMessage }}</p>
    <p v-if="successMessage" role="status" class="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">{{ successMessage }}</p>

    <template v-if="isConnected && adminAuth.isAdmin.value">
      <section class="mb-6 rounded-lg border p-5" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
        <h2 class="mb-4 text-lg font-semibold">Add location</h2>
        <form class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_160px_auto]" @submit.prevent="addLocation">
          <label class="text-sm">Place name
            <input v-model="draft.name" required maxlength="300" class="mt-1 w-full rounded border px-3 py-2" placeholder="Prague, Czech Republic">
          </label>
          <label class="text-sm">Latitude
            <input v-model.number="draft.latitude" @paste="pasteCoordinates($event, draft)" required type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2" placeholder="50.0755">
          </label>
          <label class="text-sm">Longitude
            <input v-model.number="draft.longitude" @paste="pasteCoordinates($event, draft)" required type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2" placeholder="14.4378">
          </label>
          <button type="submit" class="self-end rounded border px-4 py-2 font-medium">Add</button>
        </form>
      </section>

      <section class="overflow-hidden rounded-lg border" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
        <div class="flex items-center justify-between gap-3 border-b p-4" :class="{ 'border-gray-700': isDark, 'border-gray-200': !isDark }">
          <h2 class="font-semibold">{{ locations.length }} locations</h2>
          <div class="flex items-center gap-2">
            <button @click="saveLocations" :disabled="isSaving" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">
              {{ isSaving ? 'Saving?' : 'Save changes' }}
            </button>
            <button @click="triggerFileImport" :disabled="isImporting" class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 font-medium disabled:opacity-60" title="Import from CSV or JSON">
              {{ isImporting ? 'Importing...' : 'Import' }}
            </button>
            <input ref="fileInput" type="file" accept=".csv,.json" class="hidden" @change="handleImport">
            <button @click="exportLocations('csv')" :disabled="locations.length === 0" class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 font-medium disabled:opacity-60" title="Export as CSV">
              Export CSV
            </button>
            <button @click="exportLocations('json')" :disabled="locations.length === 0" class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 font-medium disabled:opacity-60" title="Export as JSON">
              Export JSON
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[680px] text-left text-sm">
            <thead class="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th class="px-4 py-3 font-semibold">Place</th>
                <th class="w-48 px-4 py-3 font-semibold">Latitude</th>
                <th class="w-48 px-4 py-3 font-semibold">Longitude</th>
                <th class="w-24 px-4 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(location, index) in locations" :key="`${location.name}-${index}`" class="border-t border-gray-100 dark:border-gray-700">
                <td class="px-4 py-2">
                  <input v-model="location.name" required maxlength="300" class="w-full rounded border px-3 py-2" :aria-label="`Location name ${index + 1}`">
                  <span v-if="location.latitude === null && location.longitude === null" class="mt-1 block text-xs text-amber-700 dark:text-amber-300">Coordinates needed</span>
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="location.latitude" @paste="pasteCoordinates($event, location)" type="number" step="any" min="-90" max="90" class="w-full rounded border px-3 py-2" :aria-label="`Latitude for ${location.name}`" placeholder="Pending">
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="location.longitude" @paste="pasteCoordinates($event, location)" type="number" step="any" min="-180" max="180" class="w-full rounded border px-3 py-2" :aria-label="`Longitude for ${location.name}`" placeholder="Pending">
                </td>
                <td class="px-4 py-2 text-right">
                  <button @click="locations.splice(index, 1)" class="text-red-700 underline dark:text-red-300" :aria-label="`Remove ${location.name}`">Remove</button>
                </td>
              </tr>
              <tr v-if="locations.length === 0">
                <td colspan="4" class="px-4 py-12 text-center opacity-60">No known locations yet. Add one above.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
