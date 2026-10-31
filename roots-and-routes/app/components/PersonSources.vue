<script setup lang="ts">
// Sources of the facts of a person (name, sex, birth, death, marriage, other events): the source records they cite
// (📜 title, page, confidence) and the person's links and attachments (the number is the one in the list of links,
// PersonLinks.vue). A link that belongs to a cited source record is shown only as that record, so nothing is counted
// twice. Hidden in the anonymous mode like the links. The file comes as a prop (no useGedcomStore() in components).
import type { GedcomEvent, GedcomFile, GedcomSourceCitation } from '~~/types/gedcom'
import { linkDraftOf, linksOf } from '~~/composables/useGedcomStore'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useT } from '~~/composables/useT'
import { birthNameOf, marriedNameOf } from '~~/utils/gedcom/names'
import { messages, type MessageKey } from '~~/i18n'

const props = defineProps<{
  file: GedcomFile | null
  personId: string
  // Heading style: the detail panels use small upper-case headings
  compact?: boolean
}>()

const { t } = useT()
const anon = useAnonymize()

const eventLabel = (type: string): string => {
  const key = `tree.event.${type}`
  return key in messages.en ? t(key as MessageKey) : type
}

const rows = computed(() => {
  const file = props.file
  const person = file?.individuals.get(props.personId)
  if (!file || !person || anon.enabled.value) return []
  const numbers = new Map(linksOf(file, person).map((link, index) => [link.id!, index + 1]))
  const source = (id: string) => ({ id, number: numbers.get(id), title: linkDraftOf(file, id)?.title || id })
  const record = (citation: GedcomSourceCitation) => ({
    id: citation.xref,
    title: file.sources.get(citation.xref)?.title || citation.xref,
    detail: [citation.page, citation.confidence !== undefined && citation.confidence !== null ? t(`sources.confidence.${citation.confidence}` as MessageKey) : ''].filter(Boolean).join(', '),
  })
  const facts: { label: string; ids?: string[]; citations?: GedcomSourceCitation[] }[] = [
    { label: t('tree.sources.fact.name'), ids: birthNameOf(person.names)?.multimediaLinks, citations: birthNameOf(person.names)?.sourceCitations },
    { label: t('tree.sources.fact.marriedName'), ids: marriedNameOf(person.names)?.multimediaLinks, citations: marriedNameOf(person.names)?.sourceCitations },
    { label: t('tree.sources.fact.sex'), ids: person.sexLinks, citations: person.sexCitations },
  ]
  const events: (GedcomEvent | undefined)[] = [person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events]
  for (const id of person.familiesAsSpouse) {
    const family = file.families.get(id)
    events.push(family?.marriage, family?.divorce, ...(family?.engagements || []))
  }
  for (const event of events) if (event) facts.push({ label: eventLabel(event.type), ids: event.multimediaLinks, citations: event.sourceCitations })
  if (person.sourceCitations?.length) facts.push({ label: t('tree.sources.fact.person'), citations: person.sourceCitations })
  return facts
    .map((fact) => {
      const citations = (fact.citations || []).filter(citation => file.sources.has(citation.xref))
      // Links of the cited records are shown as the records
      const inRecords = new Set(citations.flatMap(citation => file.sources.get(citation.xref)?.multimediaLinks || []))
      const links = (fact.ids || []).filter(id => file.multimedia.has(id) && !inRecords.has(id))
      return { label: fact.label, records: citations.map(record), sources: links.map(source) }
    })
    .filter(fact => fact.records.length || fact.sources.length)
})
</script>

<template>
  <section v-if="rows.length" data-person-sources>
    <h4 v-if="compact" class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ t('tree.sources.title') }}</h4>
    <div v-else class="mb-2 text-sm opacity-60">{{ t('tree.sources.title') }}</div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
      <template v-for="(row, index) in rows" :key="index">
        <dt class="opacity-70">{{ row.label }}</dt>
        <dd class="min-w-0 break-words">
          <span v-for="(item, position) in row.records" :key="`r-${position}`" data-fact-record>
            <span v-if="position" class="opacity-60"> · </span>
            <span aria-hidden="true">📜 </span><NuxtLink :to="`/sources?id=${item.id}`" class="text-primary-700 underline dark:text-primary-300">{{ item.title }}</NuxtLink><span v-if="item.detail" class="opacity-70"> ({{ item.detail }})</span>
          </span>
          <span v-for="(item, position) in row.sources" :key="item.id">
            <span v-if="position || row.records.length" class="opacity-60"> · </span>
            <span v-if="item.number" class="mr-1 text-xs font-semibold text-primary-700 dark:text-primary-300">[{{ item.number }}]</span>{{ item.title }}
          </span>
        </dd>
      </template>
    </dl>
  </section>
</template>
