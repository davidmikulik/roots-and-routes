<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import { parseCoordinatePair } from '~~/utils/gedcom/coordinates'
import type { KnownLocation } from '~~/types/locations'
import { useKnownLocations } from '~~/composables/useKnownLocations'
import { PLACE_LINK_MAX_TITLE, PLACE_LINK_MAX_URL, parsePlaceLink, type ParsedPlaceLink } from '~~/utils/gedcom/archiveMaps'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const { t } = useT()
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
const knownLocations = useKnownLocations()

// Links of each place: any web address (ČÚZK archive sheets get a descriptive label) with an optional title.
// Adding or removing a link saves the catalog right away, like the other changes would with "Save".
type LinkDraft = { url: string; title: string }
const linkDrafts = ref(new Map<KnownLocation, LinkDraft>())
const linkDraft = (location: KnownLocation): LinkDraft => linkDrafts.value.get(location) || { url: '', title: '' }
const setLinkDraft = (location: KnownLocation, change: Partial<LinkDraft>) => {
  linkDrafts.value = new Map(linkDrafts.value).set(location, { ...linkDraft(location), ...change })
}
const archiveMapsOf = (location: KnownLocation): ParsedPlaceLink[] =>
  (location.archiveMaps || []).map(map => parsePlaceLink(map.url, map.title)).filter((map): map is ParsedPlaceLink => !!map)
const addArchiveMap = async (location: KnownLocation) => {
  const draft = linkDraft(location)
  const parsed = parsePlaceLink(draft.url, draft.title)
  if (!parsed) {
    errorMessage.value = t('locations.archive.invalid')
    return
  }
  errorMessage.value = ''
  const maps = location.archiveMaps || []
  if (maps.some(map => map.url === parsed.url)) {
    errorMessage.value = t('locations.archive.duplicate')
    return
  }
  location.archiveMaps = [...maps, { url: parsed.url, ...(parsed.title ? { title: parsed.title } : {}) }]
  linkDrafts.value = new Map(linkDrafts.value).set(location, { url: '', title: '' })
  await saveLocations()
}
const removeArchiveMap = async (location: KnownLocation, index: number) => {
  location.archiveMaps = (location.archiveMaps || []).filter((_, position) => position !== index)
  await saveLocations()
}

const loadLocations = async () => {
  if (!adminAuth.canEditPlaces.value) {
    isConnected.value = false
    return
  }
  isLoading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await $fetch<{ locations: KnownLocation[] }>('/api/admin/locations', { headers: getHeaders() })
    locations.value = response.locations.map(location => ({ ...location }))
    knownLocations.set(locations.value)
    isConnected.value = true
  } catch (error: any) {
    isConnected.value = false
    errorMessage.value = error.data?.statusMessage || error.message || t('locations.error.load')
  } finally {
    isLoading.value = false
  }
}

// Load as soon as the session is known (restored after mount or entered above)
watch(() => adminAuth.canEditPlaces.value, canEdit => { if (canEdit) loadLocations() }, { immediate: true })

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
    errorMessage.value = t('locations.error.invalidDraft')
    return
  }
  if (locations.value.some(location => location.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0)) {
    errorMessage.value = t('locations.error.duplicate')
    return
  }
  locations.value.push({ name, latitude: draft.latitude, longitude: draft.longitude })
  locations.value.sort((first, second) => first.name.localeCompare(second.name))
  draft.name = ''
  draft.latitude = null
  draft.longitude = null
  errorMessage.value = ''
}

// Two-way sync with the tree (includes edits in the table that are not saved yet)
const isSyncing = ref(false)
const syncWithTree = async () => {
  if (!window.confirm(t('locations.sync.confirm'))) return
  isSyncing.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const result = await gedcomStore.syncKnownLocations(locations.value)
    locations.value = result.catalog.map(location => ({ ...location })).sort((first, second) => first.name.localeCompare(second.name))
    knownLocations.set(locations.value)
    successMessage.value = t('locations.sync.done', { added: result.added, updated: result.updated, filled: result.filled, overwritten: result.overwritten })
  } catch (error: any) {
    errorMessage.value = error.data?.statusMessage || error.message || t('locations.error.save')
  } finally {
    isSyncing.value = false
  }
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
    knownLocations.set(locations.value)
    const refreshedLocations = await gedcomStore.refreshLocationCoordinates(locations.value)
    successMessage.value = t('locations.success.saved', { saved: response.count, updated: refreshedLocations })
  } catch (error: any) {
    errorMessage.value = error.data?.statusMessage || error.message || t('locations.error.save')
  } finally {
    isSaving.value = false
  }
}

const exportLocations = (format: 'csv' | 'json') => {
  if (locations.value.length === 0) {
    errorMessage.value = t('locations.error.noExport')
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
  successMessage.value = t('locations.success.exported', { count: locations.value.length, format: format.toUpperCase() })
}

const parseCSV = (content: string): KnownLocation[] => {
  const lines = content.split('\n').filter(line => line.trim() !== '')
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'))
  const latIndex = headers.findIndex(h => h.toLowerCase().includes('latitude'))
  const lonIndex = headers.findIndex(h => h.toLowerCase().includes('longitude'))
  
  if (nameIndex === -1 || latIndex === -1 || lonIndex === -1) {
    throw new Error(t('locations.error.csvColumns'))
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
      errorMessage.value = t('locations.error.badFileType')
      return
    }
    
    if (newLocations.length === 0) {
      errorMessage.value = t('locations.error.noValid')
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
      successMessage.value = t('locations.success.imported', { added: addedCount, skipped: newLocations.length - addedCount })
    } else {
      errorMessage.value = t('locations.error.allExist')
    }
  } catch (error: any) {
    errorMessage.value = error.message || t('locations.error.import')
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
        <p class="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">{{ t('locations.admin') }}</p>
        <h1 class="mt-1 text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('locations.title') }}</h1>
        <p class="mt-2 text-sm opacity-70">{{ t('locations.subtitle') }}</p>
      </div>
      <NuxtLink to="/settings" class="text-sm underline">{{ t('locations.back') }}</NuxtLink>
    </header>

    <section class="mb-6 rounded-lg border p-5" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
      <AdminLogin />
      <button v-if="adminAuth.canEditPlaces.value" type="button" :disabled="isLoading" class="mt-3 rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60" @click="loadLocations">
        {{ isLoading ? t('locations.loading') : isConnected ? t('locations.reload') : t('locations.load') }}
      </button>
    </section>

    <p v-if="errorMessage" role="alert" class="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{{ errorMessage }}</p>
    <p v-if="successMessage" role="status" class="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">{{ successMessage }}</p>

    <template v-if="isConnected && adminAuth.canEditPlaces.value">
      <section class="mb-6 rounded-lg border p-5" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
        <h2 class="mb-4 text-lg font-semibold">{{ t('locations.add.title') }}</h2>
        <form class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_160px_160px_auto]" @submit.prevent="addLocation">
          <label class="text-sm">{{ t('locations.add.name') }}
            <input v-model="draft.name" required maxlength="300" class="mt-1 w-full rounded border px-3 py-2" :placeholder="t('locations.add.namePlaceholder')">
          </label>
          <label class="text-sm">{{ t('locations.add.latitude') }}
            <input v-model.number="draft.latitude" @paste="pasteCoordinates($event, draft)" required type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2" placeholder="50.0755">
          </label>
          <label class="text-sm">{{ t('locations.add.longitude') }}
            <input v-model.number="draft.longitude" @paste="pasteCoordinates($event, draft)" required type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2" placeholder="14.4378">
          </label>
          <button type="submit" class="self-end rounded border px-4 py-2 font-medium">{{ t('locations.add.button') }}</button>
        </form>
      </section>

      <section class="overflow-hidden rounded-lg border" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
        <div class="flex items-center justify-between gap-3 border-b p-4" :class="{ 'border-gray-700': isDark, 'border-gray-200': !isDark }">
          <h2 class="font-semibold">{{ t('locations.count', { count: locations.length }) }}</h2>
          <div class="flex items-center gap-2">
            <button @click="saveLocations" :disabled="isSaving" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">
              {{ isSaving ? t('locations.saving') : t('locations.save') }}
            </button>
            <button
              @click="syncWithTree"
              :disabled="isSyncing || !gedcomStore.hasData.value"
              class="rounded border border-primary-600 px-4 py-2 font-medium text-primary-700 dark:text-primary-300 disabled:opacity-60"
              :title="t('locations.sync.title')"
            >{{ isSyncing ? t('locations.sync.running') : t('locations.sync.button') }}</button>
            <button @click="triggerFileImport" :disabled="isImporting" class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 font-medium disabled:opacity-60" :title="t('locations.importTitle')">
              {{ isImporting ? t('locations.importing') : t('locations.import') }}
            </button>
            <input ref="fileInput" type="file" accept=".csv,.json" class="hidden" @change="handleImport">
            <button @click="exportLocations('csv')" :disabled="locations.length === 0" class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 font-medium disabled:opacity-60" :title="t('locations.exportCsvTitle')">
              {{ t('locations.exportCsv') }}
            </button>
            <button @click="exportLocations('json')" :disabled="locations.length === 0" class="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 font-medium disabled:opacity-60" :title="t('locations.exportJsonTitle')">
              {{ t('locations.exportJson') }}
            </button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[680px] text-left text-sm">
            <thead class="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th class="px-4 py-3 font-semibold">{{ t('locations.table.place') }}</th>
                <th class="w-48 px-4 py-3 font-semibold">{{ t('locations.table.latitude') }}</th>
                <th class="w-48 px-4 py-3 font-semibold">{{ t('locations.table.longitude') }}</th>
                <th class="w-24 px-4 py-3 text-right font-semibold">{{ t('locations.table.action') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(location, index) in locations" :key="`${location.name}-${index}`" class="border-t border-gray-100 dark:border-gray-700">
                <td class="px-4 py-2">
                  <input v-model="location.name" required maxlength="300" class="w-full rounded border px-3 py-2" :aria-label="t('locations.table.nameAria', { index: index + 1 })">
                  <span v-if="location.latitude === null && location.longitude === null" class="mt-1 block text-xs text-amber-700 dark:text-amber-300">{{ t('locations.table.coordsNeeded') }}</span>
                  <div class="mt-2" data-archive-maps>
                    <p class="mb-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">{{ t('locations.archive.label') }}</p>
                    <ArchiveMapLinks :maps="archiveMapsOf(location)" removable :show-source="false" @remove="removeArchiveMap(location, $event)" />
                    <div class="mt-1 flex flex-wrap gap-2">
                      <input
                        :value="linkDraft(location).url"
                        @input="setLinkDraft(location, { url: ($event.target as HTMLInputElement).value })"
                        @keydown.enter.prevent="addArchiveMap(location)"
                        inputmode="url"
                        :maxlength="PLACE_LINK_MAX_URL"
                        class="min-w-[12rem] flex-[2] rounded border px-2 py-1 text-xs"
                        :placeholder="t('locations.archive.placeholder')"
                        :aria-label="t('locations.archive.aria', { name: location.name })"
                        data-link-url
                      >
                      <input
                        :value="linkDraft(location).title"
                        @input="setLinkDraft(location, { title: ($event.target as HTMLInputElement).value })"
                        @keydown.enter.prevent="addArchiveMap(location)"
                        :maxlength="PLACE_LINK_MAX_TITLE"
                        class="min-w-[8rem] flex-1 rounded border px-2 py-1 text-xs"
                        :placeholder="t('locations.archive.titlePlaceholder')"
                        :aria-label="t('locations.archive.titleAria', { name: location.name })"
                        data-link-title
                      >
                      <button type="button" class="rounded border px-2 py-1 text-xs" :disabled="isSaving" @click="addArchiveMap(location)">{{ t('locations.archive.add') }}</button>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="location.latitude" @paste="pasteCoordinates($event, location)" type="number" step="any" min="-90" max="90" class="w-full rounded border px-3 py-2" :aria-label="t('locations.table.latitudeAria', { name: location.name })" :placeholder="t('locations.table.pending')">
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="location.longitude" @paste="pasteCoordinates($event, location)" type="number" step="any" min="-180" max="180" class="w-full rounded border px-3 py-2" :aria-label="t('locations.table.longitudeAria', { name: location.name })" :placeholder="t('locations.table.pending')">
                </td>
                <td class="px-4 py-2 text-right">
                  <button @click="locations.splice(index, 1)" class="text-red-700 underline dark:text-red-300" :aria-label="t('locations.table.removeAria', { name: location.name })">{{ t('locations.table.remove') }}</button>
                </td>
              </tr>
              <tr v-if="locations.length === 0">
                <td colspan="4" class="px-4 py-12 text-center opacity-60">{{ t('locations.table.empty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
