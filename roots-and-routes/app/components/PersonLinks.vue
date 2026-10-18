<script setup lang="ts">
// Links of a person and the documents stored in the tree (GEDCOM OBJE records, see AGENTS.md "Odkazy osoby").
// Shared by the detail on the Tree page and the person detail (map, graphical tree). Stored files are private (admin
// token), so they are fetched when shown and linked as blob: URLs; images, PDF and text open in a new tab, office
// documents download under the link's description. A copy made from a web address keeps the address: description →
// address, then "attachment" → the copy. A file pasted from the clipboard has no address: the description links to
// the copy. Visitors get no links (the anonymized data have none); the anonymous mode hides them like the places.
// The file comes as a prop: useGedcomStore() in a component would reload the tree from the server on every mount.
import type { GedcomFile } from '~~/types/gedcom'
import { isStoredMedia, linksOf, type LinkDraft } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  file: GedcomFile | null
  personId: string
  // Heading style: the detail panels use small upper-case headings
  compact?: boolean
}>()

const { t } = useT()
const adminAuth = useAdminAuth()
const anon = useAnonymize()

const links = computed<LinkDraft[]>(() => {
  const individual = props.file?.individuals.get(props.personId)
  return props.file && individual && !anon.enabled.value ? linksOf(props.file, individual) : []
})

const isWebAddress = (value: string) => /^https?:\/\/\S+$/i.test(value.trim())
const OPENS_IN_BROWSER = /\.(jpg|png|gif|webp|pdf|txt)$/
const downloadName = (link: LinkDraft): string | undefined =>
  OPENS_IN_BROWSER.test(link.file || '') ? undefined : `${link.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'document'}.${link.format || 'bin'}`

const urls = ref(new Map<string, string>())
const failed = ref(new Set<string>())
const release = () => {
  for (const url of urls.value.values()) URL.revokeObjectURL(url)
  urls.value = new Map()
}
const storedKey = computed(() => links.value.map(link => link.file).filter(isStoredMedia).join('|'))
watch(storedKey, async (key) => {
  release()
  failed.value = new Set()
  if (!key || !adminAuth.isAdmin.value || !import.meta.client) return
  const loaded = new Map<string, string>()
  const missing = new Set<string>()
  await Promise.all(key.split('|').map(async (path) => {
    try {
      const blob = await $fetch<Blob>(`/api/${path}`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
      loaded.set(path, URL.createObjectURL(blob))
    } catch (error) {
      missing.add(path)
      console.error(`[LINKS] Attachment ${path} could not be loaded:`, error)
    }
  }))
  // The detail may have moved on to another person meanwhile
  if (key === storedKey.value) { urls.value = loaded; failed.value = missing } else for (const url of loaded.values()) URL.revokeObjectURL(url)
}, { immediate: true })
onUnmounted(release)

const linkClass = 'text-primary-700 dark:text-primary-300 underline break-all'
</script>

<template>
  <section v-if="links.length" data-person-links>
    <h4 v-if="compact" class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ t('tree.links.title') }}</h4>
    <div v-else class="mb-2 text-sm opacity-60">{{ t('tree.links.title') }}</div>
    <ul class="space-y-1 text-sm">
      <li v-for="link in links" :key="link.id" :data-link="link.id">
        <template v-if="isStoredMedia(link.file)">
          <span aria-hidden="true" class="mr-1">📎</span>
          <template v-if="isWebAddress(link.url)">
            <a :href="link.url" target="_blank" rel="noopener noreferrer" :class="linkClass">{{ link.title }}</a>
            <span class="opacity-60"> · </span>
          </template>
          <a
            v-if="urls.get(link.file)"
            :href="urls.get(link.file)"
            :download="downloadName(link)"
            target="_blank"
            rel="noopener"
            data-attachment
            :class="linkClass"
          >{{ isWebAddress(link.url) ? t('tree.links.attachment') : link.title }}</a>
          <span v-else-if="failed.has(link.file)" class="opacity-60" :title="t('tree.links.loadFailed')">{{ isWebAddress(link.url) ? t('tree.links.attachment') : link.title }} ({{ t('tree.links.unavailable') }})</span>
          <span v-else :class="linkClass" class="opacity-60" :title="t('tree.links.loading')">{{ isWebAddress(link.url) ? t('tree.links.attachment') : link.title }}</span>
        </template>
        <template v-else-if="isWebAddress(link.url)">
          <span aria-hidden="true" class="mr-1">🔗</span>
          <a :href="link.url" target="_blank" rel="noopener noreferrer" :class="linkClass">{{ link.title }}</a>
        </template>
        <span v-else class="break-all">{{ link.title }} ({{ link.url }})</span>
      </li>
    </ul>
  </section>
</template>
