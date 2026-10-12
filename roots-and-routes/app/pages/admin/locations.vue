<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import type { KnownLocation } from '~~/types/locations'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const gedcomStore = useGedcomStore()
const adminToken = ref('')
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

const getHeaders = () => ({ Authorization: `Bearer ${adminToken.value.trim()}` })

const loadLocations = async () => {
  if (!adminToken.value.trim()) {
    errorMessage.value = 'Enter the administrator token.'
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
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="loadLocations">
        <label class="min-w-64 flex-1 text-sm font-medium">Administrator token
          <input v-model="adminToken" type="password" autocomplete="current-password" class="mt-1 w-full rounded border px-3 py-2" placeholder="ADMIN_API_TOKEN">
        </label>
        <button type="submit" :disabled="isLoading" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">
          {{ isLoading ? 'Connecting?' : isConnected ? 'Reload locations' : 'Connect' }}
        </button>
      </form>
    </section>

    <p v-if="errorMessage" role="alert" class="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{{ errorMessage }}</p>
    <p v-if="successMessage" role="status" class="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">{{ successMessage }}</p>

    <template v-if="isConnected">
      <section class="mb-6 rounded-lg border p-5" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
        <h2 class="mb-4 text-lg font-semibold">Add location</h2>
        <form class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_160px_auto]" @submit.prevent="addLocation">
          <label class="text-sm">Place name
            <input v-model="draft.name" required maxlength="300" class="mt-1 w-full rounded border px-3 py-2" placeholder="Prague, Czech Republic">
          </label>
          <label class="text-sm">Latitude
            <input v-model.number="draft.latitude" required type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2" placeholder="50.0755">
          </label>
          <label class="text-sm">Longitude
            <input v-model.number="draft.longitude" required type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2" placeholder="14.4378">
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
                  <input v-model.number="location.latitude" type="number" step="any" min="-90" max="90" class="w-full rounded border px-3 py-2" :aria-label="`Latitude for ${location.name}`" placeholder="Pending">
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="location.longitude" type="number" step="any" min="-180" max="180" class="w-full rounded border px-3 py-2" :aria-label="`Longitude for ${location.name}`" placeholder="Pending">
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
