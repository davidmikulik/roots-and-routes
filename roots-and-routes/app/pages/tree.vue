<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { isStoredMedia, linksOf } from '~~/composables/useGedcomStore'
import type { IndividualDraft, LinkDraft } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { parseCoordinatePair } from '~~/utils/gedcom/coordinates'
import { useSettings } from '~~/composables/useSettings'
import { useAnonymize } from '~~/composables/useAnonymize'
import { messages, type MessageKey } from '~~/i18n'
import { useT } from '~~/composables/useT'
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
const editorOpen = ref(false)
const editingPersonId = ref<string | null>(null)
const personForm = ref<IndividualDraft>(createEmptyDraft())
const eventTypeOptions = ['CHR', 'BAPM', 'BURI', 'CREM', 'DIV', 'ENGA', 'ADOP', 'CENS', 'RESI', 'OCCU', 'EDUC', 'RETI', 'EMIG', 'IMMI', 'MILI', 'RELI', 'EVEN', 'FACT'] as const

const eventLabel = (code: string): string => {
  const key = `tree.event.${code}`
  return key in messages.en ? t(key as MessageKey) : code
}

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

const placeTip = (place: string): string => {
  if (anon.enabled.value) return t('tree.placeHidden')
  return place || t('tree.placeUnknown')
}

const createEmptyEventDraft = () => ({ type: 'EVEN' as const, date: '', place: '', latitude: '', longitude: '', description: '' })

function createEmptyDraft(): IndividualDraft {
  return {
    fullName: '', sex: '', birthDate: '', birthPlace: '', birthLatitude: '', birthLongitude: '',
    deathDate: '', deathPlace: '', deathLatitude: '', deathLongitude: '',
    notes: '', fatherId: '', motherId: '', spouseId: '',
    marriageDate: '', marriagePlace: '', marriageLatitude: '', marriageLongitude: '', events: [], links: [],
  }
}

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
  // In anonymous mode only what is displayed can be searched, otherwise the search would reveal the real names
  return allPeople.value.filter(person => 
    anon.name(person.fullName).toLowerCase().includes(query) ||
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
  return person?.names[0]?.full ? anon.name(person.names[0].full) : xrefId
}

const selectById = (xrefId: string) => {
  const person = allPeople.value.find(candidate => candidate.id === xrefId)
  if (person) selectPerson(person)
}

const formatDateInput = (date?: Date | null): string => date && !Number.isNaN(date.getTime())
  ? date.toISOString().slice(0, 10)
  : ''

const openPersonEditor = (person?: AppPerson) => {
  const individual = person ? gedcomStore.individuals.value.get(person.id) : undefined
  const file = gedcomStore.state.value.file
  const parentFamily = individual?.familiesAsChild.map((id: string) => file?.families.get(id)).find(Boolean)
  const partnerFamily = individual?.familiesAsSpouse.map((id: string) => file?.families.get(id)).find(Boolean)
  const firstPartner = partnerFamily
    ? partnerFamily.husband === individual?.xrefId ? partnerFamily.wife : partnerFamily.husband
    : ''
  editingPersonId.value = individual?.xrefId || null
  personForm.value = individual ? {
    xrefId: individual.xrefId,
    fullName: individual.names[0]?.full || '',
    sex: individual.sex,
    birthDate: formatDateInput(individual.birth?.date?.parsed),
    birthPlace: individual.birth?.place || '',
    birthLatitude: individual.birth?.coordinates?.[0]?.toString() || '',
    birthLongitude: individual.birth?.coordinates?.[1]?.toString() || '',
    deathDate: formatDateInput(individual.death?.date?.parsed),
    deathPlace: individual.death?.place || '',
    deathLatitude: individual.death?.coordinates?.[0]?.toString() || '',
    deathLongitude: individual.death?.coordinates?.[1]?.toString() || '',
    notes: individual.notes.join('\n'),
    fatherId: parentFamily?.husband || '',
    motherId: parentFamily?.wife || '',
    spouseId: firstPartner || '',
    marriageDate: formatDateInput(partnerFamily?.marriage?.date?.parsed),
    marriagePlace: partnerFamily?.marriage?.place || '',
    marriageLatitude: partnerFamily?.marriage?.coordinates?.[0]?.toString() || '',
    marriageLongitude: partnerFamily?.marriage?.coordinates?.[1]?.toString() || '',
    events: individual.events.map((event: GedcomEvent) => ({
      type: event.type, date: formatDateInput(event.date?.parsed), existingDate: event.date, place: event.place || '',
      latitude: event.coordinates?.[0]?.toString() || '', longitude: event.coordinates?.[1]?.toString() || '',
      description: event.description || '',
    })),
    links: file ? linksOf(file, individual) : [],
  } : createEmptyDraft()
  copyingLinks.value = new Set()
  editorOpen.value = true
}

const addEvent = () => personForm.value.events.push(createEmptyEventDraft())
const removeEvent = (index: number) => personForm.value.events.splice(index, 1)

// Links: any number, each with a required description; an image or document can be copied into the tree
const addLink = () => personForm.value.links.push({ url: '', title: '' })
const removeLink = (index: number) => personForm.value.links.splice(index, 1)
// A new address no longer matches the stored copy
// A copy downloaded from the address no longer matches a new address; a pasted file stays
const changeLinkUrl = (link: LinkDraft) => {
  if (link.copiedFrom === undefined || link.url.trim() === link.copiedFrom) return
  link.file = undefined
  link.format = undefined
  link.copiedFrom = undefined
}
const copyingLinks = ref(new Set<LinkDraft>())
const copiedSizes = ref(new Map<LinkDraft, number>())
const isWebAddress = (value: string) => /^https?:\/\/\S+$/i.test(value.trim())
const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`
const copyLink = async (link: LinkDraft) => {
  copyingLinks.value = new Set(copyingLinks.value).add(link)
  try {
    const copied = await gedcomStore.copyLinkToTree(link.url.trim())
    link.file = copied.file
    link.format = copied.format
    link.copiedFrom = link.url.trim()
    copiedSizes.value = new Map(copiedSizes.value).set(link, copied.size)
  } catch (error) {
    window.alert(t('tree.links.copyFailed', { error: errorText(error) }))
  } finally {
    const next = new Set(copyingLinks.value)
    next.delete(link)
    copyingLinks.value = next
  }
}

// From the clipboard: the button reads an image (browsers give no other files to the clipboard API);
// Ctrl+V in the link row also takes a document copied in a file manager
const uploadToLink = async (link: LinkDraft, file: Blob, name: string) => {
  copyingLinks.value = new Set(copyingLinks.value).add(link)
  try {
    const stored = await gedcomStore.uploadMediaToTree(file, name)
    link.file = stored.file
    link.format = stored.format
    link.copiedFrom = undefined
    copiedSizes.value = new Map(copiedSizes.value).set(link, stored.size)
  } catch (error) {
    window.alert(t('tree.links.copyFailed', { error: errorText(error) }))
  } finally {
    const next = new Set(copyingLinks.value)
    next.delete(link)
    copyingLinks.value = next
  }
}
const pasteFromClipboard = async (link: LinkDraft) => {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(candidate => candidate.startsWith('image/'))
      if (type) return await uploadToLink(link, await item.getType(type), `clipboard.${type.split('/')[1]}`)
    }
  } catch (error) {
    console.warn('[TREE] Clipboard read failed:', error)
  }
  window.alert(t('tree.links.clipboardEmpty'))
}
const pasteIntoLink = (event: ClipboardEvent, link: LinkDraft) => {
  const file = event.clipboardData?.files?.[0]
  if (!file) return
  event.preventDefault()
  void uploadToLink(link, file, file.name || 'clipboard')
}
const openCopy = async (path: string) => {
  try {
    await gedcomStore.openStoredMedia(path)
  } catch (error) {
    window.alert(errorText(error))
  }
}

// Links of the selected person for the detail (visitors get none: the anonymized data have no links)
const selectedLinks = computed(() => {
  const file = gedcomStore.state.value.file
  const individual = selectedPerson.value ? gedcomStore.individuals.value.get(selectedPerson.value.id) : undefined
  return file && individual ? linksOf(file, individual) : []
})

// Attachments in the detail are ordinary links like the web links: they are private (admin token), so the files are
// fetched when the detail shows them and linked as blob: URLs. Office documents get a file name and download.
const attachmentUrls = ref(new Map<string, string>())
const OPENS_IN_BROWSER = /\.(jpg|png|gif|webp|pdf|txt)$/
const attachmentDownloadName = (link: LinkDraft): string | undefined =>
  OPENS_IN_BROWSER.test(link.file || '') ? undefined : `${link.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document'}.${link.format || 'bin'}`
const releaseAttachmentUrls = () => {
  for (const url of attachmentUrls.value.values()) URL.revokeObjectURL(url)
  attachmentUrls.value = new Map()
}
watch(() => selectedLinks.value.map(link => link.file).filter(isStoredMedia).join('|'), async (key) => {
  releaseAttachmentUrls()
  if (!key || !adminAuth.isAdmin.value) return
  const urls = new Map<string, string>()
  await Promise.all(key.split('|').map(async (path) => {
    try {
      urls.set(path, URL.createObjectURL(await gedcomStore.fetchStoredMedia(path)))
    } catch (error) {
      console.error(`[TREE] Attachment ${path} could not be loaded:`, error)
    }
  }))
  // The detail may have moved on to another person meanwhile
  if (key === selectedLinks.value.map(link => link.file).filter(isStoredMedia).join('|')) attachmentUrls.value = urls
  else for (const url of urls.values()) URL.revokeObjectURL(url)
})
onUnmounted(releaseAttachmentUrls)

// Pasting "lat, lng" into either coordinate field fills both fields
const pasteCoordinates = (event: ClipboardEvent, target: Record<string, any>, latitudeKey: string, longitudeKey: string) => {
  const pair = parseCoordinatePair(event.clipboardData?.getData('text') || '')
  if (!pair) return
  event.preventDefault()
  target[latitudeKey] = String(pair[0])
  target[longitudeKey] = String(pair[1])
}

const saveChanges = async () => {
  try {
    await gedcomStore.saveNow()
  } catch (error) {
    window.alert(t('tree.savingFailed', { error: errorText(error) }))
  }
}

const errorText = (error: any): string => error?.data?.statusMessage || error?.message || t('tree.unknownError')

const savePerson = async () => {
  if (!personForm.value.fullName.trim()) return
  try {
    const id = await gedcomStore.savePerson({ ...personForm.value, xrefId: editingPersonId.value || undefined })
    const savedPerson = gedcomStore.getAllAppPersons().find(person => person.id === id)
    if (savedPerson) selectPerson(savedPerson)
    editorOpen.value = false
    // Changed coordinates were passed on to other people with the same place, or the catalog could not be updated
    const sync = gedcomStore.lastLocationSync.value
    if (sync?.error) window.alert(t('tree.locations.syncFailed', { error: sync.error }))
    else if (sync?.propagated) window.alert(t('tree.locations.propagated', { n: sync.propagated }))
  } catch (error) {
    window.alert(t('tree.savingFailed', { error: errorText(error) }))
  }
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
      
      <template v-if="adminAuth.isAdmin.value">
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
        v-if="adminAuth.isAdmin.value"
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
        <div v-if="adminAuth.isAdmin.value" class="mb-4 flex justify-end">
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
            >
              <td class="p-4">
                <div class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  {{ anon.name(person.fullName) }}
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
                <template v-if="adminAuth.isAdmin.value">
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
        <div v-if="adminAuth.isAdmin.value" class="absolute top-4 right-14 flex gap-3 text-sm">
          <button @click="openPersonEditor(selectedPerson)" class="underline">{{ t('tree.edit') }}</button>
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
              {{ anon.name(selectedPerson.fullName) }}
            </h2>
            
            <div v-if="treeSettings.showDetails" class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div class="opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  {{ t('tree.col.lifespan') }}
                </div>
                <div :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  <LifespanTips :person="selectedPerson" />
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

            <div v-if="selectedLinks.length" class="mt-4">
              <div class="opacity-60 text-sm mb-2" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                {{ t('tree.links.title') }}
              </div>
              <ul class="space-y-1 text-sm">
                <li v-for="link in selectedLinks" :key="link.id">
                  <!-- A copy made from a web address keeps the address: description → address, then a link to the copy.
                       A file pasted from the clipboard has no address: the description links to the copy. -->
                  <template v-if="isStoredMedia(link.file)">
                    <template v-if="isWebAddress(link.url)">
                      <a :href="link.url" target="_blank" rel="noopener noreferrer" class="text-primary-700 dark:text-primary-300 underline break-all">{{ link.title }}</a>
                      <span class="opacity-60"> · </span>
                    </template>
                    <a
                      v-if="attachmentUrls.get(link.file)"
                      :href="attachmentUrls.get(link.file)"
                      :download="attachmentDownloadName(link)"
                      target="_blank"
                      rel="noopener"
                      data-attachment
                      class="text-primary-700 dark:text-primary-300 underline break-all"
                    >{{ isWebAddress(link.url) ? t('tree.links.attachment') : link.title }}</a>
                    <span v-else class="text-primary-700 dark:text-primary-300 underline break-all opacity-60" :title="t('tree.links.loading')">{{ isWebAddress(link.url) ? t('tree.links.attachment') : link.title }}</span>
                  </template>
                  <a v-else-if="isWebAddress(link.url)" :href="link.url" target="_blank" rel="noopener noreferrer" class="text-primary-700 dark:text-primary-300 underline break-all">{{ link.title }}</a>
                  <span v-else class="break-all">{{ link.title }} ({{ link.url }})</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="editorOpen && adminAuth.isAdmin.value" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="editorOpen = false">
      <form class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl" @submit.prevent="savePerson">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-xl font-bold">{{ editingPersonId ? t('tree.editor.editTitle') : t('tree.editor.addTitle') }}</h2>
          <button type="button" :aria-label="t('tree.editor.close')" @click="editorOpen = false" class="text-2xl">&times;</button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="sm:col-span-2 text-sm">{{ t('tree.field.fullName') }}
            <input v-model="personForm.fullName" required class="mt-1 w-full rounded border px-3 py-2 bg-transparent" autocomplete="name">
          </label>
          <label class="text-sm">{{ t('tree.field.sex') }}
            <select v-model="personForm.sex" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
              <option value="">{{ t('tree.sex.unknown') }}</option><option value="F">{{ t('tree.sex.female') }}</option><option value="M">{{ t('tree.sex.male') }}</option>
            </select>
          </label>
          <label class="text-sm">{{ t('tree.field.birthDate') }}
            <input v-model="personForm.birthDate" type="date" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm sm:col-span-2">{{ t('tree.field.birthPlace') }}
            <input v-model="personForm.birthPlace" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.birthLatitude') }}
            <input v-model="personForm.birthLatitude" @paste="pasteCoordinates($event, personForm, 'birthLatitude', 'birthLongitude')" type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.birthLongitude') }}
            <input v-model="personForm.birthLongitude" @paste="pasteCoordinates($event, personForm, 'birthLatitude', 'birthLongitude')" type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.deathDate') }}
            <input v-model="personForm.deathDate" type="date" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.deathPlace') }}
            <input v-model="personForm.deathPlace" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.deathLatitude') }}
            <input v-model="personForm.deathLatitude" @paste="pasteCoordinates($event, personForm, 'deathLatitude', 'deathLongitude')" type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.deathLongitude') }}
            <input v-model="personForm.deathLongitude" @paste="pasteCoordinates($event, personForm, 'deathLatitude', 'deathLongitude')" type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.father') }}
            <select v-model="personForm.fatherId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
              <option value="">{{ t('tree.field.notRecorded') }}</option>
              <option v-for="person in allPeople" :key="person.id" :value="person.id" :disabled="person.id === editingPersonId">{{ person.fullName }}</option>
            </select>
          </label>
          <label class="text-sm">{{ t('tree.field.mother') }}
            <select v-model="personForm.motherId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
              <option value="">{{ t('tree.field.notRecorded') }}</option>
              <option v-for="person in allPeople" :key="person.id" :value="person.id" :disabled="person.id === editingPersonId">{{ person.fullName }}</option>
            </select>
          </label>
          <label class="text-sm sm:col-span-2">{{ t('tree.field.partner') }}
            <select v-model="personForm.spouseId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
              <option value="">{{ t('tree.field.none') }}</option>
              <option v-for="person in allPeople" :key="person.id" :value="person.id" :disabled="person.id === editingPersonId">{{ person.fullName }}</option>
            </select>
          </label>
          <div v-if="personForm.spouseId" class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <label class="text-sm">{{ t('tree.field.marriageDate') }}
              <input v-model="personForm.marriageDate" type="date" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
            </label>
            <label class="text-sm">{{ t('tree.field.marriagePlace') }}
              <input v-model="personForm.marriagePlace" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
            </label>
            <label class="text-sm">{{ t('tree.field.marriageLatitude') }}
              <input v-model="personForm.marriageLatitude" @paste="pasteCoordinates($event, personForm, 'marriageLatitude', 'marriageLongitude')" type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
            </label>
            <label class="text-sm">{{ t('tree.field.marriageLongitude') }}
              <input v-model="personForm.marriageLongitude" @paste="pasteCoordinates($event, personForm, 'marriageLatitude', 'marriageLongitude')" type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
            </label>
          </div>
          <fieldset class="sm:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center justify-between mb-3">
              <legend class="font-medium">{{ t('tree.field.otherEvents') }}</legend>
            </div>
            <p v-if="!personForm.events.length" class="text-sm opacity-60 mb-3">{{ t('tree.field.noEvents') }}</p>
            <div v-for="(event, index) in personForm.events" :key="index" data-event-row class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-b border-gray-100 dark:border-gray-700">
              <div class="sm:col-span-2 flex items-center justify-between">
                <span class="text-sm font-medium opacity-70">{{ t('tree.field.eventNumber', { n: index + 1 }) }}</span>
                <button
                  type="button"
                  @click="removeEvent(index)"
                  class="text-sm text-red-700 dark:text-red-300 underline"
                  :aria-label="t('tree.field.removeEvent', { n: index + 1 })"
                >{{ t('tree.field.removeEventButton') }}</button>
              </div>
              <select v-model="event.type" class="rounded border px-3 py-2 bg-transparent">
                <option v-for="type in eventTypeOptions" :key="type" :value="type">{{ eventLabel(type) }}</option>
              </select>
              <input v-model="event.date" type="date" class="rounded border px-3 py-2 bg-transparent" :aria-label="t('tree.field.eventDate')">
              <input v-model="event.place" class="rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.field.place')">
              <input v-model="event.description" class="rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.field.description')">
              <input v-model="event.latitude" @paste="pasteCoordinates($event, event, 'latitude', 'longitude')" type="number" step="any" min="-90" max="90" class="rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.field.latitude')">
              <input v-model="event.longitude" @paste="pasteCoordinates($event, event, 'latitude', 'longitude')" type="number" step="any" min="-180" max="180" class="rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.field.longitude')">
            </div>
            <button type="button" @click="addEvent" class="mt-3 text-sm text-primary-700 dark:text-primary-300 underline">{{ t('tree.field.addEvent') }}</button>
          </fieldset>
          <fieldset class="sm:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div class="flex items-center justify-between mb-3">
              <legend class="font-medium">{{ t('tree.links.title') }}</legend>
              <button type="button" @click="addLink" class="text-sm text-primary-700 dark:text-primary-300 underline">{{ t('tree.links.add') }}</button>
            </div>
            <div v-for="(link, index) in personForm.links" :key="index" data-link-row @paste="pasteIntoLink($event, link)" class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-b border-gray-100 dark:border-gray-700">
              <input
                v-model="link.url"
                @input="changeLinkUrl(link)"
                inputmode="url"
                :required="!isStoredMedia(link.file)"
                class="rounded border px-3 py-2 bg-transparent"
                :placeholder="t('tree.links.url')"
                :aria-label="t('tree.links.url')"
              >
              <div class="flex gap-2">
                <input v-model="link.title" required class="min-w-0 flex-1 rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.links.description')" :aria-label="t('tree.links.description')">
                <button type="button" @click="removeLink(index)" class="px-3 text-red-600" :aria-label="t('tree.links.remove', { n: index + 1 })">&times;</button>
              </div>
              <div class="sm:col-span-2 flex flex-wrap items-center gap-3 text-sm">
                <template v-if="isStoredMedia(link.file)">
                  <span class="text-green-700 dark:text-green-400">
                    📎 {{ copiedSizes.get(link) ? t('tree.links.stored', { format: (link.format || '').toUpperCase(), size: formatSize(copiedSizes.get(link)!) }) : t('tree.links.storedShort') }}
                  </span>
                  <button type="button" @click="openCopy(link.file!)" class="underline">{{ t('tree.links.openCopy') }}</button>
                </template>
                <HoverTip v-else :text="t('tree.links.copyHint')">
                  <button
                    type="button"
                    @click="copyLink(link)"
                    :disabled="!isWebAddress(link.url) || copyingLinks.has(link)"
                    class="px-3 py-1 rounded border disabled:opacity-50"
                  >{{ copyingLinks.has(link) ? t('tree.links.copying') : t('tree.links.copy') }}</button>
                </HoverTip>
                <HoverTip :text="t('tree.links.pasteHint')">
                  <button
                    type="button"
                    @click="pasteFromClipboard(link)"
                    :disabled="copyingLinks.has(link)"
                    class="px-3 py-1 rounded border disabled:opacity-50"
                  >{{ t('tree.links.paste') }}</button>
                </HoverTip>
              </div>
            </div>
          </fieldset>
          <label class="text-sm sm:col-span-2">{{ t('tree.field.notes') }}
            <textarea v-model="personForm.notes" rows="3" class="mt-1 w-full rounded border px-3 py-2 bg-transparent"></textarea>
          </label>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button type="button" @click="editorOpen = false" class="px-4 py-2 rounded border">{{ t('tree.cancel') }}</button>
          <button type="submit" class="px-4 py-2 rounded bg-primary-600 text-white">{{ t('tree.savePerson') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
