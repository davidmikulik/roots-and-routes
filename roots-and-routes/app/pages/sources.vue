<script setup lang="ts">
// Sources (docs/zdroje-a-bezpecne-ukladani-zadani.md, chapter 4): the source records of the tree with search (title,
// book, person) and filters (confidence, archive); the detail of a record (?id=S1) with the archive, book, transcript,
// translation, images, the people in it with their roles and the facts that cite it, "Open in the archive" and the
// history of its changes; editing and new records for those who may edit; links that can be converted into records.
// For those who read the database (full data); visitors get no sources.
import { useColorMode } from '#imports'
import type { GedcomSourceParticipant, SourceRole } from '~~/types/gedcom'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useStoredMediaUrls } from '~~/composables/useStoredMediaUrls'
import { useT } from '~~/composables/useT'
import { useSettings } from '~~/composables/useSettings'
import { messages, type MessageKey } from '~~/i18n'
import {
  archiveUrlOf, bestConfidence, citationsOfSource, peopleOfSource, repositoryName, sourceImages, translationOf,
} from '~~/utils/gedcom/sources'
import { CONFIDENCE_LEVELS, SOURCE_ROLES } from '~~/utils/gedcom/sourceRoles'
import { normalizeText } from '~~/utils/gedcom/names'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const cardClass = computed(() => (isDark.value ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'))
const { t } = useT()
const adminAuth = useAdminAuth()
const anon = useAnonymize()
const gedcomStore = useGedcomStore()
const route = useRoute()
const router = useRouter()

const loaded = ref(gedcomStore.hasData.value)
onMounted(async () => {
  if (!gedcomStore.hasData.value) await gedcomStore.refreshFromServer()
  loaded.value = true
})

const file = computed(() => gedcomStore.state.value.file)
const canEdit = computed(() => adminAuth.canEdit.value && !gedcomStore.state.value.anonymized && !!file.value)
const visible = computed(() => adminAuth.canRead.value && !gedcomStore.state.value.anonymized && !anon.enabled.value)

const roleLabel = (role: string) => t(`sources.role.${role}` as MessageKey)
const confidenceLabel = (value?: number) => (value === undefined ? '' : t(`sources.confidence.${value}` as MessageKey))
const personName = (id: string) => anon.personName(file.value?.individuals.get(id)) || id
const eventLabel = (type: string): string => {
  if (type === 'NAME') return t('tree.sources.fact.name')
  if (type === 'SEX') return t('tree.sources.fact.sex')
  if (type === 'INDI') return t('tree.sources.fact.person')
  if (type === 'FAM') return t('sources.detail.family')
  const key = `tree.event.${type}`
  return key in messages.en ? t(key as MessageKey) : type
}

// ---------------------------------------------------------------------------------------------- list
const query = ref('')
const confidenceFilter = ref('')
const archiveFilter = ref('')

const rows = computed(() => {
  const data = file.value
  if (!data) return []
  return [...data.sources.values()].map((source) => {
    const citations = citationsOfSource(data, source.xrefId)
    const people = peopleOfSource(data, source.xrefId)
    return {
      id: source.xrefId,
      title: source.title || source.xrefId,
      publication: source.publication || '',
      repository: repositoryName(data, source),
      confidence: bestConfidence(citations.map(item => item.citation)),
      people,
      search: normalizeText([source.title, source.publication, source.text, translationOf(source), ...people.map(personName)].join(' ')),
    }
  }).sort((a, b) => a.title.localeCompare(b.title, 'cs'))
})
const archives = computed(() => [...new Set(rows.value.map(row => row.repository).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs')))
const filtered = computed(() => {
  const words = normalizeText(query.value).split(/\s+/).filter(Boolean)
  return rows.value.filter(row =>
    words.every(word => row.search.includes(word))
    && (!confidenceFilter.value || (confidenceFilter.value === 'none' ? row.confidence === undefined : String(row.confidence) === confidenceFilter.value))
    && (!archiveFilter.value || row.repository === archiveFilter.value))
})

// ---------------------------------------------------------------------------------------------- detail
const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const select = (id: string) => router.push({ query: { ...route.query, id: id || undefined } })
const selected = computed(() => (selectedId.value ? file.value?.sources.get(selectedId.value) : undefined))

const detail = computed(() => {
  const data = file.value
  const source = selected.value
  if (!data || !source) return null
  return {
    repository: repositoryName(data, source),
    archiveUrl: archiveUrlOf(data, source),
    translation: translationOf(source),
    images: sourceImages(data, source),
    links: (source.multimediaLinks || []).map(id => data.multimedia.get(id)).filter(Boolean).filter(media => !media!.file?.startsWith('media/') || !/\.(jpe?g|png|gif|webp)$/i.test(media!.file)),
    citations: citationsOfSource(data, source.xrefId).map(item => ({
      ...item,
      who: item.personId ? personName(item.personId) : [data.families.get(item.familyId!)?.husband, data.families.get(item.familyId!)?.wife].filter(Boolean).map(id => personName(id!)).join(' & '),
      personId: item.personId || data.families.get(item.familyId!)?.husband || data.families.get(item.familyId!)?.wife,
    })),
  }
})
const imagePaths = computed(() => detail.value?.images.map(image => image.file) || [])
const { urls } = useStoredMediaUrls(imagePaths)

// History of the record (saved changes that touched it), for those who may edit
const history = ref<{ revision: number; at: string; title: string; actor: { username: string } }[]>([])
watch([selectedId, () => gedcomStore.state.value.revision], async ([id]) => {
  history.value = []
  if (!id || !adminAuth.canEdit.value || !import.meta.client) return
  try {
    const response = await $fetch<{ entries: typeof history.value }>('/api/gedcom/history', { headers: adminAuth.authHeaders(gedcomStore.state.value.databaseId), query: { record: `sources:${id}`, limit: 20 } })
    if (id === selectedId.value) history.value = response.entries
  } catch (error) {
    console.error('[SOURCES] History could not be loaded:', error)
  }
}, { immediate: true })
const { settings } = useSettings()
const formatTime = (value: string) => new Date(value).toLocaleString(settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB')

// ---------------------------------------------------------------------------------------------- editing
interface ParticipantRow { person: string; role: SourceRole; age: string; note: string }
const editing = ref(false)
const busy = ref(false)
const message = ref<{ type: 'ok' | 'error'; text: string } | null>(null)
const form = reactive({ title: '', author: '', repository: '', repositoryUrl: '', publication: '', language: '', transcript: '', translation: '', url: '', image: '', verifiedBy: '', verifiedAt: '' })
const participants = ref<ParticipantRow[]>([])

const startEdit = (create = false) => {
  const source = create ? undefined : selected.value
  const data = file.value
  Object.assign(form, {
    title: source?.title || '',
    author: source?.author || '',
    repository: source && data ? repositoryName(data, source) : '',
    repositoryUrl: '',
    publication: source?.publication || '',
    language: source?.language || '',
    transcript: source?.text || '',
    translation: source ? translationOf(source) : '',
    url: '',
    image: '',
    verifiedBy: source?.verifiedBy || '',
    verifiedAt: source?.verifiedAt || '',
  })
  participants.value = (source?.participants || []).map(item => ({ person: item.person, role: item.role, age: item.age || '', note: item.note || '' }))
  creating.value = create
  editing.value = true
  message.value = null
}
const creating = ref(false)
const addParticipant = () => participants.value.push({ person: '', role: 'other', age: '', note: '' })
const removeParticipant = (index: number) => participants.value.splice(index, 1)
const errorText = (error: any): string => error?.data?.statusMessage || error?.message || t('tree.unknownError')

// An image of the record (a cut-out of the register) stored in the tree
const uploading = ref(false)
const uploadImage = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const picked = input.files?.[0]
  input.value = ''
  if (!picked) return
  uploading.value = true
  try {
    form.image = (await gedcomStore.uploadMediaToTree(picked, picked.name)).file
  } catch (error) {
    message.value = { type: 'error', text: t('sources.saveFailed', { error: errorText(error) }) }
  } finally {
    uploading.value = false
  }
}

const save = async () => {
  if (!form.title.trim()) { message.value = { type: 'error', text: t('sources.titleRequired') }; return }
  busy.value = true
  try {
    const list: GedcomSourceParticipant[] = participants.value
      .filter(row => row.person)
      .map(row => ({ person: row.person, role: row.role, ...(row.age.trim() ? { age: row.age.trim() } : {}), ...(row.note.trim() ? { note: row.note.trim() } : {}) }))
    const id = await gedcomStore.saveSource(creating.value ? null : selectedId.value, { ...form }, list)
    editing.value = false
    message.value = { type: 'ok', text: gedcomStore.state.value.dirty ? t('sources.savedLocally') : t('sources.saved') }
    if (id !== selectedId.value) await select(id)
  } catch (error) {
    message.value = { type: 'error', text: t('sources.saveFailed', { error: errorText(error) }) }
  } finally {
    busy.value = false
  }
}

const remove = async () => {
  if (!selected.value || !window.confirm(t('sources.deleteConfirm', { title: selected.value.title }))) return
  busy.value = true
  try {
    await gedcomStore.deleteSource(selected.value.xrefId)
    editing.value = false
    await select('')
    message.value = { type: 'ok', text: t('sources.deleted') }
  } catch (error) {
    message.value = { type: 'error', text: t('sources.saveFailed', { error: errorText(error) }) }
  } finally {
    busy.value = false
  }
}

const saveChanges = async () => {
  try {
    await gedcomStore.saveNow()
    message.value = { type: 'ok', text: t('sources.saved') }
  } catch (error) {
    message.value = { type: 'error', text: t('tree.savingFailed', { error: errorText(error) }) }
  }
}

// ---------------------------------------------------------------------------------------------- converting links
// Links (OBJE) of people that are not part of any source record yet
const convertible = computed(() => {
  const data = file.value
  if (!data || !canEdit.value) return []
  const inSources = new Set([...data.sources.values()].flatMap(source => source.multimediaLinks || []))
  const users = new Map<string, Set<string>>()
  const add = (id: string, person: string) => users.set(id, (users.get(id) || new Set()).add(person))
  for (const person of data.individuals.values()) {
    const ids = [...person.multimediaLinks, ...(person.sexLinks || []), ...person.names.flatMap(name => name.multimediaLinks || []),
      ...[person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events].flatMap(event => event?.multimediaLinks || [])]
    for (const id of ids) add(id, person.xrefId)
  }
  return [...data.multimedia.values()]
    .filter(media => !inSources.has(media.xrefId) && users.has(media.xrefId))
    .map(media => ({ id: media.xrefId, title: media.title || media.url || media.file || media.xrefId, people: [...users.get(media.xrefId)!].map(personName).join(', ') }))
})
const convert = async (mediaId: string) => {
  busy.value = true
  try {
    const id = await gedcomStore.convertLinkToSource(mediaId)
    await select(id)
    message.value = { type: 'ok', text: t('sources.converted') }
  } catch (error) {
    message.value = { type: 'error', text: t('sources.saveFailed', { error: errorText(error) }) }
  } finally {
    busy.value = false
  }
}

const people = computed(() => [...(file.value?.individuals.values() || [])]
  .map(person => ({ id: person.xrefId, label: `${anon.personName(person)} (${person.xrefId})`, key: anon.sortKey(person) }))
  .sort((a, b) => a.key.localeCompare(b.key)))
const inputClass = 'w-full rounded border bg-transparent px-2 py-1.5'
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('title.sources') }}</h1>
        <p class="mt-1 text-sm opacity-70">{{ t('sources.subtitle') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button v-if="gedcomStore.state.value.dirty && canEdit" type="button" class="rounded bg-amber-600 px-3 py-1.5 text-sm text-white" data-sources-save @click="saveChanges">{{ t('tree.saveToServer') }}</button>
        <button v-if="canEdit" type="button" class="rounded bg-primary-600 px-3 py-1.5 text-sm text-white" data-source-new @click="startEdit(true)">{{ t('sources.new') }}</button>
      </div>
    </header>

    <p v-if="!loaded" class="opacity-70">{{ t('graph.loading') }}</p>
    <section v-else-if="!visible" class="rounded-lg border p-5" :class="cardClass">
      <p class="text-sm">{{ adminAuth.canRead.value ? t('sources.anonymous') : t('sources.readRequired') }}</p>
    </section>
    <template v-else>
      <p v-if="message" :role="message.type === 'error' ? 'alert' : 'status'" class="mb-4 rounded border p-3 text-sm" :class="message.type === 'error'
        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        : 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'"
      >{{ message.text }}</p>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <!-- List -->
        <section class="rounded-lg border p-4" :class="cardClass" data-sources-list>
          <div class="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <input v-model="query" type="search" :class="inputClass" class="sm:col-span-3 lg:col-span-1 xl:col-span-3" :placeholder="t('sources.search')" :aria-label="t('sources.search')" data-sources-search>
            <select v-model="confidenceFilter" :class="inputClass" :aria-label="t('sources.confidence.label')">
              <option value="" class="text-gray-900">{{ t('sources.filter.anyConfidence') }}</option>
              <option v-for="level in CONFIDENCE_LEVELS" :key="level" :value="String(level)" class="text-gray-900">{{ confidenceLabel(level) }}</option>
              <option value="none" class="text-gray-900">{{ t('sources.confidence.none') }}</option>
            </select>
            <select v-model="archiveFilter" :class="inputClass" class="sm:col-span-2 lg:col-span-1 xl:col-span-2" :aria-label="t('sources.field.repository')">
              <option value="" class="text-gray-900">{{ t('sources.filter.anyArchive') }}</option>
              <option v-for="archive in archives" :key="archive" :value="archive" class="text-gray-900">{{ archive }}</option>
            </select>
          </div>
          <p class="mb-2 text-xs opacity-70">{{ t('sources.count', { n: filtered.length, total: rows.length }) }}</p>
          <p v-if="!rows.length" class="text-sm opacity-70">{{ t('sources.empty') }}</p>
          <ul class="max-h-[70vh] divide-y overflow-y-auto text-sm dark:divide-gray-700">
            <li v-for="row in filtered" :key="row.id">
              <button
                type="button"
                class="w-full px-2 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                :class="row.id === selectedId ? 'bg-primary-50 dark:bg-primary-900/30' : ''"
                :data-source-row="row.id"
                @click="select(row.id); editing = false"
              >
                <span class="block font-medium">📜 {{ row.title }}</span>
                <span class="block text-xs opacity-70">
                  {{ [row.repository, row.publication].filter(Boolean).join(' · ') }}
                  <template v-if="row.people.length"> · {{ t('sources.peopleCount', { n: row.people.length }) }}</template>
                  <template v-if="row.confidence !== undefined"> · {{ confidenceLabel(row.confidence) }}</template>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <!-- Detail or form -->
        <section class="rounded-lg border p-4" :class="cardClass" data-source-detail>
          <form v-if="editing" class="grid gap-3 sm:grid-cols-2" data-source-form @submit.prevent="save">
            <h2 class="text-lg font-semibold sm:col-span-2">{{ creating ? t('sources.new') : t('sources.edit') }}</h2>
            <label class="sm:col-span-2">
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.title') }} *</span>
              <input v-model="form.title" type="text" :class="inputClass" :placeholder="t('sources.field.titlePlaceholder')" required data-source-title>
            </label>
            <label>
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.repository') }}</span>
              <input v-model="form.repository" type="text" :class="inputClass" list="source-archives" :placeholder="t('sources.field.repositoryPlaceholder')">
              <datalist id="source-archives"><option v-for="archive in archives" :key="archive" :value="archive" /></datalist>
            </label>
            <label>
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.repositoryUrl') }}</span>
              <input v-model="form.repositoryUrl" type="url" :class="inputClass" placeholder="https://">
            </label>
            <label>
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.publication') }}</span>
              <input v-model="form.publication" type="text" :class="inputClass" :placeholder="t('sources.field.publicationPlaceholder')">
            </label>
            <label>
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.language') }}</span>
              <select v-model="form.language" :class="inputClass">
                <option value="" class="text-gray-900">—</option>
                <option v-for="code in ['cs', 'de', 'la']" :key="code" :value="code" class="text-gray-900">{{ t(`sources.language.${code}` as MessageKey) }}</option>
                <option v-if="form.language && !['cs', 'de', 'la'].includes(form.language)" :value="form.language" class="text-gray-900">{{ form.language }}</option>
              </select>
            </label>
            <label class="sm:col-span-2">
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.transcript') }}</span>
              <textarea v-model="form.transcript" rows="5" :class="inputClass" class="font-serif" data-source-transcript />
            </label>
            <label class="sm:col-span-2">
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.translation') }}</span>
              <textarea v-model="form.translation" rows="4" :class="inputClass" data-source-translation />
            </label>
            <label class="sm:col-span-2">
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.url') }}</span>
              <input v-model="form.url" type="url" :class="inputClass" placeholder="https://">
              <span class="mt-0.5 block text-xs opacity-60">{{ t('sources.field.urlHint') }}</span>
            </label>
            <div class="sm:col-span-2">
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.image') }}</span>
              <input type="file" accept="image/*" :disabled="uploading" class="text-sm" @change="uploadImage">
              <span v-if="uploading" class="ml-2 text-xs opacity-70">{{ t('tree.links.loading') }}</span>
              <span v-else-if="form.image" class="ml-2 text-xs text-green-700 dark:text-green-400">✓ {{ t('sources.field.imageReady') }}</span>
            </div>
            <label>
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.verifiedBy') }}</span>
              <input v-model="form.verifiedBy" type="text" :class="inputClass">
            </label>
            <label>
              <span class="mb-1 block text-sm opacity-70">{{ t('sources.field.verifiedAt') }}</span>
              <input v-model="form.verifiedAt" type="date" :class="inputClass">
            </label>

            <fieldset class="sm:col-span-2" data-source-participants>
              <legend class="mb-1 text-sm font-semibold">{{ t('sources.participants.title') }}</legend>
              <p class="mb-2 text-xs opacity-70">{{ t('sources.participants.hint') }}</p>
              <div v-for="(row, index) in participants" :key="index" class="mb-2 grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_5rem_auto]" data-participant-row>
                <select v-model="row.person" :class="inputClass" :aria-label="t('sources.participants.person')">
                  <option value="" class="text-gray-900">{{ t('sources.participants.choose') }}</option>
                  <option v-for="person in people" :key="person.id" :value="person.id" class="text-gray-900">{{ person.label }}</option>
                </select>
                <select v-model="row.role" :class="inputClass" :aria-label="t('sources.participants.role')">
                  <option v-for="role in SOURCE_ROLES" :key="role" :value="role" class="text-gray-900">{{ roleLabel(role) }}</option>
                </select>
                <input v-model="row.age" type="text" :class="inputClass" :placeholder="t('sources.participants.age')" :aria-label="t('sources.participants.age')">
                <button type="button" class="rounded border px-2 text-sm" :aria-label="t('sources.participants.remove')" @click="removeParticipant(index)">×</button>
                <input v-model="row.note" type="text" :class="inputClass" class="sm:col-span-4" :placeholder="t('sources.participants.note')" :aria-label="t('sources.participants.note')">
              </div>
              <button type="button" class="rounded border px-3 py-1 text-sm" data-participant-add @click="addParticipant">+ {{ t('sources.participants.add') }}</button>
            </fieldset>

            <div class="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" class="rounded bg-primary-600 px-4 py-1.5 text-white disabled:opacity-50" :disabled="busy" data-source-save>{{ t('sources.save') }}</button>
              <button type="button" class="rounded border px-4 py-1.5" @click="editing = false">{{ t('common.cancel') }}</button>
              <button v-if="!creating" type="button" class="ml-auto rounded border border-red-400 px-4 py-1.5 text-red-700 dark:text-red-300" :disabled="busy" data-source-delete @click="remove">{{ t('sources.delete') }}</button>
            </div>
          </form>

          <div v-else-if="selected && detail">
            <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
              <h2 class="text-lg font-semibold">📜 {{ selected.title || selected.xrefId }}</h2>
              <button v-if="canEdit" type="button" class="rounded border px-3 py-1 text-sm" data-source-edit @click="startEdit()">{{ t('sources.edit') }}</button>
            </div>
            <dl class="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <template v-if="detail.repository"><dt class="opacity-70">{{ t('sources.field.repository') }}</dt><dd>{{ detail.repository }}</dd></template>
              <template v-if="selected.publication"><dt class="opacity-70">{{ t('sources.field.publication') }}</dt><dd>{{ selected.publication }}</dd></template>
              <template v-if="selected.author"><dt class="opacity-70">{{ t('sources.field.author') }}</dt><dd>{{ selected.author }}</dd></template>
              <template v-if="selected.language"><dt class="opacity-70">{{ t('sources.field.language') }}</dt><dd>{{ ['cs', 'de', 'la'].includes(selected.language) ? t(`sources.language.${selected.language}` as MessageKey) : selected.language }}</dd></template>
              <template v-if="selected.verifiedBy || selected.verifiedAt"><dt class="opacity-70">{{ t('sources.field.verified') }}</dt><dd>{{ [selected.verifiedBy, selected.verifiedAt].filter(Boolean).join(', ') }}</dd></template>
            </dl>
            <a v-if="detail.archiveUrl" :href="detail.archiveUrl" target="_blank" rel="noopener noreferrer" class="mb-3 inline-block rounded bg-primary-600 px-3 py-1.5 text-sm text-white" data-source-archive>{{ t('sources.openArchive') }} ↗</a>
            <div v-if="detail.images.length" class="mb-3 flex flex-wrap gap-2">
              <a v-for="image in detail.images" :key="image.id" :href="urls.get(image.file)" target="_blank" rel="noopener">
                <img v-if="urls.get(image.file)" :src="urls.get(image.file)" :alt="image.title || selected.title" class="max-h-64 rounded border">
                <span v-else class="text-xs opacity-60">{{ t('tree.links.loading') }}</span>
              </a>
            </div>
            <div v-if="selected.text" class="mb-3">
              <h3 class="text-sm font-semibold">{{ t('sources.field.transcript') }}</h3>
              <p class="whitespace-pre-wrap break-words font-serif text-sm">{{ selected.text }}</p>
            </div>
            <div v-if="detail.translation" class="mb-3">
              <h3 class="text-sm font-semibold">{{ t('sources.field.translation') }}</h3>
              <p class="whitespace-pre-wrap break-words text-sm">{{ detail.translation }}</p>
            </div>
            <div v-if="detail.links.length" class="mb-3">
              <h3 class="text-sm font-semibold">{{ t('tree.links.title') }}</h3>
              <ul class="text-sm">
                <li v-for="media in detail.links" :key="media!.xrefId">
                  <a v-if="/^https?:/i.test(media!.file || '')" :href="media!.file" target="_blank" rel="noopener noreferrer" class="text-primary-700 underline break-all dark:text-primary-300">{{ media!.title || media!.file }}</a>
                  <span v-else>{{ media!.title || media!.file }}</span>
                </li>
              </ul>
            </div>
            <div class="mb-3">
              <h3 class="text-sm font-semibold">{{ t('sources.participants.title') }}</h3>
              <p v-if="!selected.participants?.length" class="text-sm opacity-70">{{ t('sources.participants.none') }}</p>
              <ul class="flex flex-wrap gap-1.5 text-xs">
                <li v-for="(participant, index) in selected.participants || []" :key="index">
                  <NuxtLink :to="`/graph?root=${participant.person}`" class="inline-block rounded-full border border-primary-300 bg-primary-50 px-2.5 py-1 text-primary-800 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200" :data-participant="participant.person">
                    {{ personName(participant.person) }} – {{ roleLabel(participant.role) }}<template v-if="participant.age">, {{ participant.age }}</template>
                  </NuxtLink>
                  <span v-if="participant.note" class="ml-1 opacity-70">{{ participant.note }}</span>
                </li>
              </ul>
            </div>
            <div class="mb-3">
              <h3 class="text-sm font-semibold">{{ t('sources.detail.cited') }}</h3>
              <p v-if="!detail.citations.length" class="text-sm opacity-70">{{ t('sources.detail.notCited') }}</p>
              <ul class="text-sm">
                <li v-for="(item, index) in detail.citations" :key="index">
                  <NuxtLink v-if="item.personId" :to="`/graph?root=${item.personId}`" class="text-primary-700 underline dark:text-primary-300">{{ item.who }}</NuxtLink>
                  – {{ eventLabel(item.type) }}<template v-if="item.citation.page">, {{ item.citation.page }}</template><template v-if="item.citation.confidence !== undefined">, {{ confidenceLabel(item.citation.confidence) }}</template>
                </li>
              </ul>
            </div>
            <div v-if="history.length">
              <h3 class="text-sm font-semibold">{{ t('sources.detail.history') }}</h3>
              <ul class="text-sm">
                <li v-for="entry in history" :key="entry.revision">
                  <NuxtLink :to="`/history?revision=${entry.revision}`" class="text-primary-700 underline dark:text-primary-300">{{ formatTime(entry.at) }}</NuxtLink>
                  · {{ entry.actor.username }} · {{ entry.title }}
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="text-sm opacity-70">{{ t('sources.choose') }}</p>
        </section>
      </div>

      <section v-if="convertible.length" class="mt-4 rounded-lg border p-4" :class="cardClass" data-convertible-links>
        <h2 class="mb-1 text-lg font-semibold">{{ t('sources.convert.title') }}</h2>
        <p class="mb-2 text-sm opacity-70">{{ t('sources.convert.hint') }}</p>
        <ul class="divide-y text-sm dark:divide-gray-700">
          <li v-for="link in convertible" :key="link.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
            <span class="min-w-0">
              <span class="block break-words">🔗 {{ link.title }}</span>
              <span class="block text-xs opacity-70">{{ link.people }}</span>
            </span>
            <button type="button" class="rounded border px-3 py-1 text-sm" :disabled="busy" :data-convert-link="link.id" @click="convert(link.id)">{{ t('sources.convert.button') }}</button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
