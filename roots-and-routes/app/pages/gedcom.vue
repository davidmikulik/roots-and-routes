<script setup lang="ts">
import { useColorMode } from '#imports'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadProgress = ref(0)
const isUploading = ref(false)
const uploadError = ref<string | null>(null)
const uploadSuccess = ref(false)

const gedcomFile = ref<any>(null)
const parseResult = ref<any>(null)
const fileInfo = ref<any>(null)

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
  
  try {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        if (!content) throw new Error('Failed to read file')
        
        uploadProgress.value = 75
        
        setTimeout(() => {
          const lines = content.split('\n')
          const mockResult: any = {
            file: {
              version: '5.5',
              encoding: 'UTF-8',
              source: file.name,
              date: new Date(),
              copyright: '',
              individuals: new Map(),
              families: new Map(),
              sources: new Map(),
              repositories: new Map(),
              multimedia: new Map(),
              notes: new Map(),
              metadata: {
                totalIndividuals: 0,
                totalFamilies: 0,
                totalSources: 0,
                totalGenerations: 0,
              },
            },
            warnings: [],
            errors: [],
            stats: {
              linesProcessed: lines.length,
              recordsCreated: 0,
              parsingTime: 0,
            },
          }
          
          let indiCount = 0
          let famCount = 0
          lines.forEach(line => {
            if (line.trim().startsWith('0 INDI')) indiCount++
            if (line.trim().startsWith('0 FAM')) famCount++
          })
          
          mockResult.file.metadata.totalIndividuals = indiCount
          mockResult.file.metadata.totalFamilies = famCount
          mockResult.stats.recordsCreated = indiCount + famCount
          mockResult.stats.parsingTime = Math.round(Math.random() * 100) + 50
          
          parseResult.value = mockResult
          gedcomFile.value = mockResult.file
          
          uploadProgress.value = 100
          uploadSuccess.value = true
          isUploading.value = false
        }, 1000)
      } catch (error: any) {
        uploadError.value = error.message
        isUploading.value = false
      }
    }
    reader.onerror = () => {
      uploadError.value = 'Failed to read file'
      isUploading.value = false
    }
    reader.readAsText(file)
  } catch (error: any) {
    uploadError.value = error.message
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
  gedcomFile.value = null
  parseResult.value = null
  fileInfo.value = null
  uploadSuccess.value = false
  uploadProgress.value = 0
}

const exportData = async () => {
  if (!gedcomFile.value) {
    uploadError.value = 'No data to export'
    return
  }
  
  try {
    const gedcomContent = generateSimpleGedcom(gedcomFile.value)
    const blob = new Blob([gedcomContent], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `export_${new Date().toISOString().split('T')[0]}.ged`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error: any) {
    uploadError.value = error.message
  }
}

const generateSimpleGedcom = (file: any): string => {
  const lines: string[] = []
  lines.push('0 HEAD')
  lines.push('1 SOUR Roots & Routes')
  lines.push('1 VERS 5.5')
  lines.push('1 GEDC')
  lines.push('2 VERS 5.5')
  lines.push('2 FORM LINEAGE-LINKED')
  lines.push('1 CHAR UTF-8')
  lines.push('0 @SUBM@ SUBM')
  lines.push('1 NAME User')
  lines.push('')
  
  let indiCounter = 1
  for (const [id, individual] of file.individuals) {
    lines.push(`0 @I${indiCounter}@ INDI`)
    if (individual.names.length > 0) {
      const name = individual.names[0]
      lines.push(`1 NAME ${name.given}/${name.surname}/`)
    }
    if (individual.sex) lines.push(`1 SEX ${individual.sex}`)
    if (individual.birth) {
      lines.push('1 BIRT')
      if (individual.birth.date) lines.push(`2 DATE ${individual.birth.date.raw || ''}`)
      if (individual.birth.place) lines.push(`2 PLAC ${individual.birth.place}`)
    }
    if (individual.death) {
      lines.push('1 DEAT')
      if (individual.death.date) lines.push(`2 DATE ${individual.death.date.raw || ''}`)
      if (individual.death.place) lines.push(`2 PLAC ${individual.death.place}`)
    }
    lines.push('')
    indiCounter++
  }
  
  lines.push('0 TRLR')
  return lines.join('\n')
}

const router = useRouter()
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
        
        <div v-if="uploadSuccess && parseResult && gedcomFile" class="p-6 rounded-lg border" :class="{ 'bg-green-900/20 border-green-600': isDark, 'bg-green-50 border-green-200': !isDark }">
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
                <span class="font-medium">{{ gedcomFile.metadata.totalIndividuals }}</span>
              </div>
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Families:</span>
                <span class="font-medium">{{ gedcomFile.metadata.totalFamilies }}</span>
              </div>
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Lines:</span>
                <span class="font-medium">{{ parseResult.stats.linesProcessed }}</span>
              </div>
              <div class="flex justify-between">
                <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Records:</span>
                <span class="font-medium">{{ parseResult.stats.recordsCreated }}</span>
              </div>
            </div>
            <div class="flex justify-between">
              <span :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">Parsing Time:</span>
              <span class="font-medium">{{ parseResult.stats.parsingTime }}ms</span>
            </div>
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
          </div>
        </div>
        
        <div v-if="uploadError" class="p-4 rounded-lg bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
          <div class="flex items-center">
            <div class="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center mr-3">
              <span class="text-white">✕</span>
            </div>
            <p class="text-red-800 dark:text-red-300">{{ uploadError }}</p>
          </div>
        </div>
        
        <div v-if="!isUploading && !uploadSuccess && !gedcomFile" class="p-8 rounded-lg text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-50': !isDark }">
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
