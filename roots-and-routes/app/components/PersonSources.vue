<script setup lang="ts">
// Sources of the facts of a person (name, sex, birth, death, marriage, other events): which of the person's links and
// attachments each fact comes from. The number is the one of the link in the list of links (PersonLinks.vue).
// Hidden in the anonymous mode like the links. The file comes as a prop (no useGedcomStore() in components).
import type { GedcomEvent, GedcomFile } from '~~/types/gedcom'
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
  const facts: { label: string; ids?: string[] }[] = [
    { label: t('tree.sources.fact.name'), ids: birthNameOf(person.names)?.multimediaLinks },
    { label: t('tree.sources.fact.marriedName'), ids: marriedNameOf(person.names)?.multimediaLinks },
    { label: t('tree.sources.fact.sex'), ids: person.sexLinks },
  ]
  const events: (GedcomEvent | undefined)[] = [person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events]
  for (const id of person.familiesAsSpouse) {
    const family = file.families.get(id)
    events.push(family?.marriage, family?.divorce, ...(family?.engagements || []))
  }
  for (const event of events) if (event) facts.push({ label: eventLabel(event.type), ids: event.multimediaLinks })
  return facts
    .filter(fact => fact.ids?.some(id => file.multimedia.has(id)))
    .map(fact => ({ label: fact.label, sources: fact.ids!.filter(id => file.multimedia.has(id)).map(source) }))
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
          <span v-for="(item, position) in row.sources" :key="item.id">
            <span v-if="position" class="opacity-60"> · </span>
            <span v-if="item.number" class="mr-1 text-xs font-semibold text-primary-700 dark:text-primary-300">[{{ item.number }}]</span>{{ item.title }}
          </span>
        </dd>
      </template>
    </dl>
  </section>
</template>
