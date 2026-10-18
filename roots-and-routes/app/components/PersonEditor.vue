<script setup lang="ts">
// The person editor dialog shared by the Tree and the Graphical tree pages (composables/usePersonEditor.ts holds the
// state and saves through the page's store). Name, sex, birth, death, parents, partner and marriage, other events,
// links and attachments, notes.
import { isStoredMedia, type LinkDraft } from '~~/composables/useGedcomStore'
import type { PersonEditor } from '~~/composables/usePersonEditor'
import { parseCoordinatePair } from '~~/utils/gedcom/coordinates'
import { messages, type MessageKey } from '~~/i18n'
import { useT } from '~~/composables/useT'

const props = defineProps<{ editor: PersonEditor }>()
const emit = defineEmits<{ (event: 'saved', id: string): void }>()
const { t } = useT()

const form = computed(() => props.editor.draft.value)
const editingId = computed(() => props.editor.editingId.value)
const people = computed(() => props.editor.people.value)

const eventTypeOptions = ['CHR', 'BAPM', 'BURI', 'CREM', 'DIV', 'ENGA', 'ADOP', 'CENS', 'RESI', 'OCCU', 'EDUC', 'RETI', 'EMIG', 'IMMI', 'MILI', 'RELI', 'EVEN', 'FACT'] as const
const eventLabel = (code: string): string => {
  const key = `tree.event.${code}`
  return key in messages.en ? t(key as MessageKey) : code
}
const createEmptyEventDraft = () => ({ type: 'EVEN' as const, date: '', place: '', latitude: '', longitude: '', description: '' })
const addEvent = () => form.value.events.push(createEmptyEventDraft())
const removeEvent = (index: number) => form.value.events.splice(index, 1)
// Heading of an event in the editor: its type and its number among events of that type ("Bydliště 2")
const eventHeading = (index: number): string => {
  const type = form.value.events[index]!.type
  const number = form.value.events.slice(0, index + 1).filter(event => event.type === type).length
  return `${eventLabel(type)} ${number}`
}

// Pasting "lat, lng" into either coordinate field fills both fields
const pasteCoordinates = (event: ClipboardEvent, target: Record<string, any>, latitudeKey: string, longitudeKey: string) => {
  const pair = parseCoordinatePair(event.clipboardData?.getData('text') || '')
  if (!pair) return
  event.preventDefault()
  target[latitudeKey] = String(pair[0])
  target[longitudeKey] = String(pair[1])
}

// Links: any number, each with a required description; an image or document can be copied into the tree
const addLink = () => form.value.links.push({ url: '', title: '' })
const removeLink = (index: number) => form.value.links.splice(index, 1)
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
const withBusy = async (link: LinkDraft, work: () => Promise<void>) => {
  copyingLinks.value = new Set(copyingLinks.value).add(link)
  try {
    await work()
  } catch (error) {
    window.alert(t('tree.links.copyFailed', { error: props.editor.errorText(error) }))
  } finally {
    const next = new Set(copyingLinks.value)
    next.delete(link)
    copyingLinks.value = next
  }
}
const copyLink = (link: LinkDraft) => withBusy(link, async () => {
  const copied = await props.editor.media.copy(link.url.trim())
  link.file = copied.file
  link.format = copied.format
  link.copiedFrom = link.url.trim()
  copiedSizes.value = new Map(copiedSizes.value).set(link, copied.size)
})
// From the clipboard: the button reads an image (browsers give no other files to the clipboard API);
// Ctrl+V in the link row also takes a document copied in a file manager
const uploadToLink = (link: LinkDraft, file: Blob, name: string) => withBusy(link, async () => {
  const stored = await props.editor.media.upload(file, name)
  link.file = stored.file
  link.format = stored.format
  link.copiedFrom = undefined
  copiedSizes.value = new Map(copiedSizes.value).set(link, stored.size)
})
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
    await props.editor.media.open(path)
  } catch (error) {
    window.alert(props.editor.errorText(error))
  }
}

const submit = async () => {
  const id = await props.editor.save()
  if (id) emit('saved', id)
}
const close = () => props.editor.close()

// Esc closes the dialog wherever the focus is; the name field gets the focus when the dialog opens
const onKeydown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  nextTick(() => (document.querySelector('[data-person-editor] [data-field-name]') as HTMLInputElement | null)?.focus())
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <form class="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl" role="dialog" aria-modal="true" data-person-editor @submit.prevent="submit">
      <div class="flex items-center justify-between" :class="editor.note.value ? 'mb-1' : 'mb-5'">
        <h2 class="text-xl font-bold">{{ editingId ? t('tree.editor.editTitle') : t('tree.editor.addTitle') }}</h2>
        <button type="button" :aria-label="t('tree.editor.close')" @click="close" class="text-2xl">&times;</button>
      </div>
      <p v-if="editor.note.value" class="mb-5 text-sm text-primary-700 dark:text-primary-300" data-relation-note>{{ editor.note.value }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label class="text-sm">{{ t('tree.field.fullName') }}
          <input v-model="form.fullName" required class="mt-1 w-full rounded border px-3 py-2 bg-transparent" autocomplete="name" data-field-name>
        </label>
        <label class="text-sm">{{ t('tree.field.marriedName') }}
          <input v-model="form.marriedName" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.field.marriedNamePlaceholder')" :title="t('tree.field.marriedNameHint')" data-field-married-name>
        </label>
        <label class="text-sm">{{ t('tree.field.sex') }}
          <select v-model="form.sex" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" data-field-sex>
            <option value="">{{ t('tree.sex.unknown') }}</option><option value="F">{{ t('tree.sex.female') }}</option><option value="M">{{ t('tree.sex.male') }}</option>
          </select>
        </label>
        <label class="text-sm">{{ t('tree.field.birthDate') }}
          <input v-model="form.birthDate" type="date" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm sm:col-span-2">{{ t('tree.field.birthPlace') }}
          <input v-model="form.birthPlace" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm">{{ t('tree.field.birthLatitude') }}
          <input v-model="form.birthLatitude" @paste="pasteCoordinates($event, form, 'birthLatitude', 'birthLongitude')" type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm">{{ t('tree.field.birthLongitude') }}
          <input v-model="form.birthLongitude" @paste="pasteCoordinates($event, form, 'birthLatitude', 'birthLongitude')" type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm">{{ t('tree.field.deathDate') }}
          <input v-model="form.deathDate" type="date" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm">{{ t('tree.field.deathPlace') }}
          <input v-model="form.deathPlace" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm sm:col-span-2">{{ t('tree.field.deathCause') }}
          <input v-model="form.deathCause" maxlength="248" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" :placeholder="t('tree.field.deathCausePlaceholder')" data-field-death-cause>
        </label>
        <label class="text-sm">{{ t('tree.field.deathLatitude') }}
          <input v-model="form.deathLatitude" @paste="pasteCoordinates($event, form, 'deathLatitude', 'deathLongitude')" type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm">{{ t('tree.field.deathLongitude') }}
          <input v-model="form.deathLongitude" @paste="pasteCoordinates($event, form, 'deathLatitude', 'deathLongitude')" type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
        </label>
        <label class="text-sm">{{ t('tree.field.father') }}
          <select v-model="form.fatherId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" data-field-father>
            <option value="">{{ t('tree.field.notRecorded') }}</option>
            <option v-for="person in people" :key="person.id" :value="person.id" :disabled="person.id === editingId">{{ person.label }}</option>
          </select>
        </label>
        <label class="text-sm">{{ t('tree.field.mother') }}
          <select v-model="form.motherId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" data-field-mother>
            <option value="">{{ t('tree.field.notRecorded') }}</option>
            <option v-for="person in people" :key="person.id" :value="person.id" :disabled="person.id === editingId">{{ person.label }}</option>
          </select>
        </label>
        <label class="text-sm sm:col-span-2">{{ t('tree.field.partner') }}
          <select v-model="form.spouseId" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" data-field-partner>
            <option value="">{{ t('tree.field.none') }}</option>
            <option v-for="person in people" :key="person.id" :value="person.id" :disabled="person.id === editingId">{{ person.label }}</option>
          </select>
        </label>
        <div v-if="form.spouseId" class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <label class="text-sm">{{ t('tree.field.marriageDate') }}
            <input v-model="form.marriageDate" type="date" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.marriagePlace') }}
            <input v-model="form.marriagePlace" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.marriageLatitude') }}
            <input v-model="form.marriageLatitude" @paste="pasteCoordinates($event, form, 'marriageLatitude', 'marriageLongitude')" type="number" step="any" min="-90" max="90" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
          <label class="text-sm">{{ t('tree.field.marriageLongitude') }}
            <input v-model="form.marriageLongitude" @paste="pasteCoordinates($event, form, 'marriageLatitude', 'marriageLongitude')" type="number" step="any" min="-180" max="180" class="mt-1 w-full rounded border px-3 py-2 bg-transparent">
          </label>
        </div>
        <fieldset class="sm:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4">
          <div class="flex items-center justify-between mb-3">
            <legend class="font-medium">{{ t('tree.field.otherEvents') }}</legend>
          </div>
          <p v-if="!form.events.length" class="text-sm opacity-60 mb-3">{{ t('tree.field.noEvents') }}</p>
          <div v-for="(event, index) in form.events" :key="index" data-event-row class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-b border-gray-100 dark:border-gray-700">
            <div class="sm:col-span-2 flex items-center justify-between">
              <span class="text-sm font-medium opacity-70">{{ eventHeading(index) }}</span>
              <button
                type="button"
                @click="removeEvent(index)"
                class="text-sm text-red-700 dark:text-red-300 underline"
                :aria-label="t('tree.field.removeEvent', { name: eventHeading(index) })"
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
          <div v-for="(link, index) in form.links" :key="index" data-link-row @paste="pasteIntoLink($event, link)" class="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-b border-gray-100 dark:border-gray-700">
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
          <textarea v-model="form.notes" rows="3" class="mt-1 w-full rounded border px-3 py-2 bg-transparent"></textarea>
        </label>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" @click="close" class="px-4 py-2 rounded border">{{ t('tree.cancel') }}</button>
        <button type="submit" class="px-4 py-2 rounded bg-primary-600 text-white disabled:opacity-60" :disabled="editor.saving.value" data-save-person>{{ t('tree.savePerson') }}</button>
      </div>
    </form>
  </div>
</template>
