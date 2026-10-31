<script setup lang="ts">
// Sources of one fact in the person editor (name, sex, birth, death, marriage, an event):
// - links and attachments of the person, or a new one (added to the links below, where its address or file and
//   description are filled in); the value is the list of link keys (LinkDraft.key), see FactSources;
// - source records (page Sources): an existing one, or a new one from a short form (title, archive, book, address);
//   each with the page (image, entry) and the confidence. The citations are `v-model:citations` (CitationDraft).
// Both kinds are listed together and each source once.
import type { CitationDraft, LinkDraft, NewSourceDraft } from '~~/composables/useGedcomStore'
import { CONFIDENCE_LEVELS } from '~~/utils/gedcom/sourceRoles'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const props = defineProps<{
  modelValue: string[]
  links: LinkDraft[]
  // Adds a new empty link to the person and returns its key
  createLink: () => string
  // What the sources are of, for screen readers ("Narození")
  fact: string
  citations?: CitationDraft[]
  // Source records to choose from: those of the tree and those created in this editor
  records?: { id: string; title: string }[]
  // Creates a source record from the short form (saved with the person) and returns its key
  createRecord?: (fields: Omit<NewSourceDraft, 'key'>) => string
}>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void
  (event: 'update:citations', value: CitationDraft[]): void
}>()
const { t } = useT()

const NEW = '__new__'
const NEW_RECORD = '__new_record__'
const RECORD = 'record:'
const label = (link: LinkDraft): string => link.title.trim() || link.url.trim() || t('tree.sources.untitled')
const chosen = computed(() => props.modelValue
  .map(key => props.links.find(link => link.key === key))
  .filter((link): link is LinkDraft => !!link))
const available = computed(() => props.links.filter(link => link.key && !props.modelValue.includes(link.key)))
const citationList = computed(() => props.citations || [])
const recordTitle = (id: string): string => props.records?.find(record => record.id === id)?.title || id
const availableRecords = computed(() => (props.records || []).filter(record => !citationList.value.some(citation => citation.source === record.id)))

const showForm = ref(false)
const form = reactive({ title: '', repository: '', publication: '', url: '' })

const choose = (event: Event) => {
  const select = event.target as HTMLSelectElement
  const value = select.value
  select.value = ''
  if (!value) return
  if (value === NEW_RECORD) {
    showForm.value = true
    return
  }
  if (value.startsWith(RECORD)) {
    emit('update:citations', [...citationList.value, { source: value.slice(RECORD.length), page: '', confidence: '' }])
    return
  }
  const key = value === NEW ? props.createLink() : value
  emit('update:modelValue', [...props.modelValue, key])
}
const remove = (key?: string) => emit('update:modelValue', props.modelValue.filter(item => item !== key))
const removeCitation = (index: number) => emit('update:citations', citationList.value.filter((_, position) => position !== index))
const updateCitation = (index: number, field: 'page' | 'confidence', value: string) =>
  emit('update:citations', citationList.value.map((citation, position) => (position === index ? { ...citation, [field]: value } : citation)))

const addRecord = () => {
  if (!form.title.trim() || !props.createRecord) return
  const key = props.createRecord({ title: form.title.trim(), repository: form.repository.trim(), publication: form.publication.trim(), url: form.url.trim() })
  emit('update:citations', [...citationList.value, { source: key, page: '', confidence: '' }])
  Object.assign(form, { title: '', repository: '', publication: '', url: '' })
  showForm.value = false
}
</script>

<template>
  <div class="text-xs" data-source-picker>
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="opacity-70">{{ t('tree.sources.label') }}:</span>
      <span
        v-for="(citation, index) in citationList"
        :key="`c-${index}-${citation.source}`"
        class="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
        data-citation-chip
      >
        <span aria-hidden="true">📜</span>
        <span class="max-w-[14rem] truncate">{{ recordTitle(citation.source) }}</span>
        <input
          :value="citation.page"
          type="text"
          class="!w-28 rounded border bg-transparent px-1 py-0"
          :placeholder="t('sources.citation.page')"
          :aria-label="t('sources.citation.page')"
          data-citation-page
          @input="updateCitation(index, 'page', ($event.target as HTMLInputElement).value)"
        >
        <select
          :value="citation.confidence"
          class="!w-auto rounded border bg-transparent px-1 py-0"
          :aria-label="t('sources.confidence.label')"
          :title="t('sources.confidence.label')"
          data-citation-confidence
          @change="updateCitation(index, 'confidence', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" class="text-gray-900">{{ t('sources.confidence.none') }}</option>
          <option v-for="level in CONFIDENCE_LEVELS" :key="level" :value="String(level)" class="text-gray-900">{{ t(`sources.confidence.${level}` as MessageKey) }}</option>
        </select>
        <button type="button" class="leading-none" :aria-label="t('tree.sources.remove', { name: recordTitle(citation.source) })" @click="removeCitation(index)">&times;</button>
      </span>
      <span
        v-for="link in chosen"
        :key="link.key"
        class="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-primary-800 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
        data-source-chip
      >
        <span aria-hidden="true">{{ link.file ? '📎' : '🔗' }}</span>
        <span class="truncate">{{ label(link) }}</span>
        <button type="button" class="leading-none" :aria-label="t('tree.sources.remove', { name: label(link) })" @click="remove(link.key)">&times;</button>
      </span>
      <select
        class="!w-auto max-w-[14rem] rounded border bg-transparent px-1.5 py-0.5"
        :aria-label="t('tree.sources.addFor', { fact })"
        data-source-add
        @change="choose"
      >
        <option value="">{{ t('tree.sources.add') }}</option>
        <optgroup v-if="available.length" :label="t('tree.sources.linksGroup')" class="text-gray-900">
          <option v-for="link in available" :key="link.key" :value="link.key" class="text-gray-900">{{ label(link) }}</option>
        </optgroup>
        <optgroup v-if="records && availableRecords.length" :label="t('tree.sources.recordsGroup')" class="text-gray-900">
          <option v-for="record in availableRecords" :key="record.id" :value="`${RECORD}${record.id}`" class="text-gray-900">📜 {{ record.title }}</option>
        </optgroup>
        <option :value="NEW" class="text-gray-900">{{ t('tree.sources.newLink') }}</option>
        <option v-if="createRecord" :value="NEW_RECORD" class="text-gray-900">{{ t('tree.sources.newRecord') }}</option>
      </select>
    </div>
    <div v-if="showForm" class="mt-2 grid gap-2 rounded-lg border border-amber-300 p-2 sm:grid-cols-2 dark:border-amber-700" data-new-record-form>
      <label class="sm:col-span-2">
        <span class="mb-0.5 block opacity-70">{{ t('sources.field.title') }} *</span>
        <input v-model="form.title" type="text" class="w-full rounded border bg-transparent px-2 py-1" :placeholder="t('sources.field.titlePlaceholder')" data-new-record-title>
      </label>
      <label>
        <span class="mb-0.5 block opacity-70">{{ t('sources.field.repository') }}</span>
        <input v-model="form.repository" type="text" class="w-full rounded border bg-transparent px-2 py-1" :placeholder="t('sources.field.repositoryPlaceholder')">
      </label>
      <label>
        <span class="mb-0.5 block opacity-70">{{ t('sources.field.publication') }}</span>
        <input v-model="form.publication" type="text" class="w-full rounded border bg-transparent px-2 py-1" :placeholder="t('sources.field.publicationPlaceholder')">
      </label>
      <label class="sm:col-span-2">
        <span class="mb-0.5 block opacity-70">{{ t('sources.field.url') }}</span>
        <input v-model="form.url" type="url" class="w-full rounded border bg-transparent px-2 py-1" placeholder="https://">
      </label>
      <div class="flex gap-2 sm:col-span-2">
        <button type="button" class="rounded bg-primary-600 px-3 py-1 text-white disabled:opacity-50" :disabled="!form.title.trim()" data-new-record-add @click="addRecord">{{ t('tree.sources.addRecord') }}</button>
        <button type="button" class="rounded border px-3 py-1" @click="showForm = false">{{ t('common.cancel') }}</button>
      </div>
    </div>
  </div>
</template>
