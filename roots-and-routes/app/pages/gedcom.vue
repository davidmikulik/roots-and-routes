<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import type { DuplicateChoice } from '~~/composables/useGedcomStore'
import type { GedcomFile } from '~~/types/gedcom'
import type { KnownLocation } from '~~/types/locations'
import { parseGedcom, writeGedcom } from '~~/utils/gedcom/parser'
import { applyKnownLocations } from '~~/utils/gedcom/locations'
import { useAdminAuth } from '~~/composables/useAdminAuth'

interface GedcomImportResponse {
  data: {
    file: { id: string; name: string; path?: string }
    locations: { unique: string[]; matched: KnownLocation[]; unresolved: string[]; added: number }
  }
}

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const gedcomStore = useGedcomStore()
const adminAuth = useAdminAuth()
const router = useRouter()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadProgress = ref(0)
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref(false)
const fileInfo = ref<any>(null)
const importMode = ref<'replace' | 'merge'>('replace')
const pendingGedcom = ref<GedcomFile | null>(null)
const pendingDuplicates = ref<ReturnType<typeof gedcomStore.findDuplicatePeople>>([])
const duplicateChoices = ref<Record<string, DuplicateChoice>>({})
const unresolvedLocations = ref<string[]>([])

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handleFile(input.files[0])
  }
}

const handleFileDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
  if (event.dataTransfer && event.dataTransfer.files.length > 0) {
    handleFile(event.dataTransfer.files[0])
  }
}

const handleFile = async (file: File) => {
  if (!adminAuth.isAdmin.value) {
    uploadError.value = 'Log in as administrator to import GEDCOM files.'
    return
  }
  uploadError.value = null
  uploadSuccess.value = false
  uploadProgress.value = 0
  isUploading.value = true
  if (!file.name.match(/\.(ged|GED|gedcom|GEDCOM)$/)) {
    uploadError.value = 'Please select a GEDCOM file (.ged or .gedcom)'
    isUploading.value = false
    return
  }
  
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    uploadError.value = `File too large. Maximum size is ${formatFileSize(maxSize)}`
    isUploading.value = false
    return
  }
  
  fileInfo.value = {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: new Date(file.lastModified),
  }
  
  uploadProgress.value = 50
  let clientImportStage = 'reading file'
  
  try {
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        clientImportStage = 'validating file'
        const content = event.target?.result as string
        if (!content) throw new Error('Failed to read file')
        
        uploadProgress.value = 75
        
        // Validate it's a GEDCOM file
        const isValidGedcom = content.includes('0 HEAD') || content.includes('0 @') || content.match(/\b(INDI|FAM|SOUR)\b/)
        if (!isValidGedcom) {
          throw new Error('Invalid GEDCOM content')
        }

        const formData = new FormData()
        formData.append('file', file)
        clientImportStage = 'sending file to import API'
        const response = await $fetch<GedcomImportResponse>('/api/gedcom/import', {
          method: 'POST',
          headers: adminAuth.authHeaders(),
          body: formData,
        })
        unresolvedLocations.value = response.data.locations.unresolved
        
        if (importMode.value === 'merge' && gedcomStore.hasData.value) {
          clientImportStage = 'preparing merge preview'
          const preview = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
          applyKnownLocations(preview.file, response.data.locations.matched)
          pendingGedcom.value = preview.file
          pendingDuplicates.value = gedcomStore.findDuplicatePeople(preview.file)
          duplicateChoices.value = Object.fromEntries(
            pendingDuplicates.value.map(duplicate => [duplicate.incomingXref, 'combine']),
          ) as Record<string, DuplicateChoice>
          uploadProgress.value = 100
          isUploading.value = false
          return
        }

        clientImportStage = 'parsing imported data in browser'
        const fileId = response.data.file?.id
        const parseResult = await gedcomStore.parseFile(content, fileId, undefined, response.data.locations.matched)
        
        if (!parseResult) {
          throw new Error('Failed to parse GEDCOM file')
        }
        
        uploadProgress.value = 100
        uploadSuccess.value = true
        isUploading.value = false
      } catch (error: any) {
        const message = [error.data?.statusMessage, error.data?.message || error.message]
          .filter((part): part is string => typeof part === 'string' && part.length > 0)
          .join(': ') || 'GEDCOM import failed'
        uploadError.value = `${clientImportStage}: ${message}`
        gedcomStore.setError(message)
        isUploading.value = false
      }
    }
    reader.onerror = () => {
      uploadError.value = 'Failed to read file'
      gedcomStore.setError('Failed to read file')
      isUploading.value = false
    }
    reader.readAsText(file)
  } catch (error: any) {
    const message = [error.data?.statusMessage, error.data?.message || error.message]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(': ') || 'GEDCOM import failed'
    uploadError.value = message
    gedcomStore.setError(message)
    isUploading.value = false
  }
}

const triggerFileInput = () => {
  if (fileInput.value) fileInput.value.click()
}

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = false
}

const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  isDragging.value = true
}

const clearData = () => {
  if (!window.confirm('Delete the family tree from the server for everyone?')) return
  gedcomStore.clear()
  fileInfo.value = null
  uploadSuccess.value = false
  uploadProgress.value = 0
}

const applyMerge = async () => {
  if (!pendingGedcom.value) return
  isUploading.value = true
  uploadError.value = null
  try {
    await gedcomStore.mergeFile(pendingGedcom.value, duplicateChoices.value)
    pendingGedcom.value = null
    pendingDuplicates.value = []
    uploadSuccess.value = true
  } catch (error: any) {
    uploadError.value = error.message || 'Failed to merge GEDCOM data'
  } finally {
    isUploading.value = false
  }
}

const cancelMerge = () => {
  pendingGedcom.value = null
  pendingDuplicates.value = []
  duplicateChoices.value = {}
}

const exportGedcom = () => {
  const file = gedcomStore.state.value.file
  if (!file) return
  const blob = new Blob([writeGedcom(file)], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'roots-and-routes.ged'
  link.click()
  URL.revokeObjectURL(url)
}

const viewOnMap = () => router.push('/map')
const viewTree = () => router.push('/tree')
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        GEDCOM Import/Export
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        Import GEDCOM files or export your family tree data
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div
        v-if="!adminAuth.isAdmin.value"
        class="p-8 rounded-2xl border-2"
        :class="{ 'bg-gray-800 border-gray-600 text-white': isDark, 'bg-gray-50 border-gray-300 text-gray-900': !isDark }"
      >
        <div class="text-6xl mb-4 text-center">🔒</div>
        <h3 class="text-xl font-bold mb-2 text-center">Import is for administrators</h3>
        <p class="opacity-75 mb-6 text-center">Log in with the administrator token to import, merge or change data.</p>
        <AdminLogin />
      </div>
      <div
        v-else
        class="relative p-8 rounded-2xl border-2 border-dashed transition-all duration-200"
        :class="{
          'bg-gray-800 border-gray-600': isDark,
          'bg-gray-50 border-gray-300': !isDark,
          'border-primary-500 bg-primary-50 dark:bg-primary-900/20': isDragging,
        }"
        @click="triggerFileInput"
        @dragover="handleDragOver"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @drop="handleFileDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".ged,.GED,.gedcom,.GEDCOM"
          @change="handleFileSelect"
          class="hidden"
        >
        
        <div class="text-center">
          <div class="text-6xl mb-4">📁</div>
          <h3 class="text-xl font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            Drop GEDCOM file here
          </h3>
          <p class="opacity-75 mb-4" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
            or click to browse
          </p>
          <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-500': !isDark }">
            Supports .ged and .gedcom files (max 10MB)
          </p>
        </div>
      </div>
      
      <div class="space-y-4">
        <div v-if="adminAuth.isAdmin.value" class="flex items-center justify-between gap-4 p-4 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
          <label for="import-mode" class="font-medium">When importing</label>
          <select id="import-mode" v-model="importMode" class="px-3 py-2 rounded border bg-transparent">
            <option value="replace">Replace current tree</option>
            <option value="merge" :disabled="!gedcomStore.hasData.value">Merge into current tree</option>
          </select>
        </div>

        <section v-if="pendingGedcom && adminAuth.isAdmin.value" class="p-5 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
          <h2 class="font-bold text-lg mb-1">Review GEDCOM merge</h2>
          <p class="text-sm opacity-75 mb-4">
            {{ pendingGedcom.individuals.size }} incoming people; {{ pendingDuplicates.length }} possible duplicates.
          </p>
          <div v-if="pendingDuplicates.length" class="max-h-72 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
            <label v-for="duplicate in pendingDuplicates" :key="duplicate.incomingXref" class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 py-3 text-sm">
              <span>{{ duplicate.incomingName }} <span class="opacity-60">matches {{ duplicate.existingName }}</span></span>
              <select v-model="duplicateChoices[duplicate.incomingXref]" class="px-2 py-1 rounded border bg-transparent">
                <option value="combine">Combine records</option>
                <option value="existing">Keep current record</option>
                <option value="incoming">Use incoming record</option>
              </select>
            </label>
          </div>
          <div class="flex gap-3 mt-5">
            <button @click="applyMerge" class="px-4 py-2 rounded bg-primary-600 text-white">Merge data</button>
            <button @click="cancelMerge" class="px-4 py-2 rounded border">Cancel</button>
          </div>
        </section>

        <div v-if="isUploading" class="p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-white border-gray-200': !isDark }">
          <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            Processing File
          </h3>
          
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-2">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Progress</span>
              <span class="font-medium">{{ uploadProgress }}%</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-primary-600 h-2 rounded-full transition-all duration-200"
                :style="{ width: `${uploadProgress}%` }"
              ></div>
            </div>
          </div>
          
          <div v-if="fileInfo" class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">File:</span>
              <span class="font-medium truncate">{{ fileInfo.name }}</span>
            </div>
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Size:</span>
              <span class="font-medium">{{ formatFileSize(fileInfo.size) }}</span>
            </div>
          </div>
        </div>
        
        <div v-if="uploadSuccess && gedcomStore.hasData.value" class="p-6 rounded-lg border" :class="{ 'bg-green-900/20 border-green-600': isDark, 'bg-green-50 border-green-200': !isDark }">
          <div class="flex items-center mb-4">
            <div class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center mr-3">
              <span class="text-white">✓</span>
            </div>
            <h3 class="font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              File Processed Successfully
            </h3>
          </div>
          
          <div class="space-y-3 text-sm">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Individuals:</span>
                <span class="font-medium">{{ gedcomStore.totalIndividuals.value }}</span>
              </div>
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Families:</span>
                <span class="font-medium">{{ gedcomStore.totalFamilies.value }}</span>
              </div>
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Lines:</span>
                <span class="font-medium">{{ gedcomStore.state.value.parseResult?.stats.linesProcessed || 0 }}</span>
              </div>
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Records:</span>
                <span class="font-medium">{{ gedcomStore.state.value.parseResult?.stats.recordsCreated || 0 }}</span>
              </div>
            </div>
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Parsing Time:</span>
              <span class="font-medium">{{ gedcomStore.state.value.parseResult?.stats.parsingTime || 0 }}ms</span>
            </div>
          </div>

          <div v-if="unresolvedLocations.length" class="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
            <p class="font-medium">{{ unresolvedLocations.length }} places have no coordinates yet.</p>
            <p class="mt-1">{{ unresolvedLocations.slice(0, 8).join(', ') }}{{ unresolvedLocations.length > 8 ? ', ?' : '' }}</p>
            <NuxtLink to="/admin/locations" class="mt-2 inline-block underline">Edit known locations</NuxtLink>
          </div>
          
          <div class="flex gap-3 mt-6">
            <button
              @click="viewOnMap"
              class="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              View on Map
            </button>
            <button
              @click="viewTree"
              class="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm font-medium"
            >
              View Tree
            </button>
            <button
              @click="exportGedcom"
              class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors text-sm font-medium"
            >
              Export GEDCOM
            </button>
            <button
              v-if="adminAuth.isAdmin.value"
              @click="clearData"
              class="px-4 py-2 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 rounded-lg text-sm font-medium"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div v-if="gedcomStore.state.value.error" class="p-4 rounded-lg bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
          <div class="flex items-center">
            <div class="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center mr-3">
              <span class="text-white">✕</span>
            </div>
            <p class="text-red-800 dark:text-red-300">{{ gedcomStore.state.value.error }}</p>
          </div>
        </div>
        
        <div v-if="!isUploading && !uploadSuccess && !gedcomStore.hasData.value" class="p-8 rounded-lg text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
          <div class="text-4xl mb-4">📄</div>
          <h3 class="font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            No GEDCOM Data
          </h3>
          <p class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
            Upload a GEDCOM file to get started
          </p>
        </div>
      </div>
    </div>

    <div class="mt-8 p-6 rounded-lg border" :class="{ 'bg-gray-800 border-gray-600': isDark, 'bg-gray-50 border-gray-200': !isDark }">
      <h3 class="font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        How to Get a GEDCOM File
      </h3>
      <ul class="space-y-2 text-sm">
        <li class="flex items-start">
          <span class="mr-2 mt-1">•</span>
          <span :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
            <strong>Ancestry.com:</strong> Go to your tree, click "Tree Settings", then "Export Tree"
          </span>
        </li>
        <li class="flex items-start">
          <span class="mr-2 mt-1">•</span>
          <span :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
            <strong>MyHeritage:</strong> Go to your family tree, click "Export" in the menu
          </span>
        </li>
        <li class="flex items-start">
          <span class="mr-2 mt-1">•</span>
          <span :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
            <strong>FamilySearch:</strong> Use the "Export" option in your tree view
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
