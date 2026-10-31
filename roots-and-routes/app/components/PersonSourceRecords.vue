<script setup lang="ts">
// Source records of a person (utils/gedcom/sources.ts): those the facts cite and those the person takes part in, with
// the confidence, the person's role, and (unfolded) the archive, book, page, transcript, translation, images and
// "Open in the archive". Also the associations made from the records (godparents and witnesses) in both directions.
// Hidden in the anonymous mode; visitors get no sources at all (anonymized data). The file comes as a prop.
import type { GedcomFile } from '~~/types/gedcom'
import { associationsOfPerson, archiveUrlOf, bestConfidence, repositoryName, sourceImages, sourcesOfPerson, translationOf } from '~~/utils/gedcom/sources'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useStoredMediaUrls } from '~~/composables/useStoredMediaUrls'
import { useT } from '~~/composables/useT'
import { messages, type MessageKey } from '~~/i18n'

const props = defineProps<{
  file: GedcomFile | null
  personId: string
  compact?: boolean
}>()
const emit = defineEmits<{ (event: 'select-person', id: string): void }>()

const { t } = useT()
const anon = useAnonymize()

const eventLabel = (type: string): string => {
  const key = `tree.event.${type}`
  if (type === 'NAME') return t('tree.sources.fact.name')
  if (type === 'SEX') return t('tree.sources.fact.sex')
  if (type === 'INDI') return t('tree.sources.fact.person')
  return key in messages.en ? t(key as MessageKey) : type
}
const roleLabel = (role: string) => t(`sources.role.${role}` as MessageKey)

const entries = computed(() => {
  const file = props.file
  if (!file || anon.enabled.value) return []
  return sourcesOfPerson(file, props.personId).map(({ source, facts, roles }) => {
    const confidence = bestConfidence(facts.map(fact => fact.citation))
    return {
      id: source.xrefId,
      title: source.title || source.xrefId,
      repository: repositoryName(file, source),
      publication: source.publication || '',
      pages: [...new Set(facts.map(fact => fact.citation.page).filter(Boolean))].join('; '),
      facts: [...new Set(facts.map(fact => eventLabel(fact.type)))].join(', '),
      roles: [...new Set(roles.map(role => roleLabel(role.role) + (role.age ? ` (${role.age})` : '')))].join(', '),
      confidence: confidence === undefined ? '' : t(`sources.confidence.${confidence}` as MessageKey),
      transcript: source.text || '',
      translation: translationOf(source),
      archiveUrl: archiveUrlOf(file, source),
      images: sourceImages(file, source),
    }
  })
})

// Godparents, witnesses… in both directions ("Kmotr: Jan Huzlík", "Kmotr u: Josef Mikulík")
const associations = computed(() => {
  const file = props.file
  if (!file || anon.enabled.value) return []
  return associationsOfPerson(file, props.personId).map(item => ({
    ...item,
    label: t(`sources.association.${item.reverse ? 'of' : 'is'}.${['godparent', 'witness'].includes(item.relationship) ? item.relationship : 'other'}` as MessageKey, { relation: item.relationship }),
    name: anon.personName(file.individuals.get(item.personId)),
  }))
})

const imagePaths = computed(() => entries.value.flatMap(entry => entry.images.map(image => image.file)))
const { urls } = useStoredMediaUrls(imagePaths)
const heading = 'mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400'
</script>

<template>
  <div v-if="entries.length || associations.length" data-person-records>
    <section v-if="entries.length">
      <h4 v-if="compact" :class="heading">{{ t('sources.person.title') }}</h4>
      <div v-else class="mb-2 text-sm opacity-60">{{ t('sources.person.title') }}</div>
      <ul class="space-y-1.5 text-sm">
        <li v-for="entry in entries" :key="entry.id" :data-person-record="entry.id">
          <details class="rounded-md border border-amber-200 px-2 py-1 dark:border-amber-800">
            <summary class="cursor-pointer">
              <span aria-hidden="true">📜 </span><span class="font-medium">{{ entry.title }}</span>
              <span v-if="entry.confidence" class="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{{ entry.confidence }}</span>
              <span v-if="entry.roles" class="ml-1 text-xs opacity-70">· {{ entry.roles }}</span>
            </summary>
            <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <template v-if="entry.facts"><dt class="opacity-70">{{ t('sources.person.facts') }}</dt><dd>{{ entry.facts }}</dd></template>
              <template v-if="entry.repository"><dt class="opacity-70">{{ t('sources.field.repository') }}</dt><dd>{{ entry.repository }}</dd></template>
              <template v-if="entry.publication"><dt class="opacity-70">{{ t('sources.field.publication') }}</dt><dd>{{ entry.publication }}</dd></template>
              <template v-if="entry.pages"><dt class="opacity-70">{{ t('sources.citation.page') }}</dt><dd>{{ entry.pages }}</dd></template>
            </dl>
            <div v-if="entry.transcript" class="mt-1">
              <div class="text-xs opacity-70">{{ t('sources.field.transcript') }}</div>
              <p class="whitespace-pre-wrap break-words font-serif text-sm" data-record-transcript>{{ entry.transcript }}</p>
            </div>
            <div v-if="entry.translation" class="mt-1">
              <div class="text-xs opacity-70">{{ t('sources.field.translation') }}</div>
              <p class="whitespace-pre-wrap break-words text-sm" data-record-translation>{{ entry.translation }}</p>
            </div>
            <div v-if="entry.images.length" class="mt-1 flex flex-wrap gap-2">
              <a v-for="image in entry.images" :key="image.id" :href="urls.get(image.file)" target="_blank" rel="noopener">
                <img v-if="urls.get(image.file)" :src="urls.get(image.file)" :alt="image.title || entry.title" class="max-h-40 rounded border">
                <span v-else class="text-xs opacity-60">{{ t('tree.links.loading') }}</span>
              </a>
            </div>
            <div class="mt-1 flex flex-wrap gap-3 text-xs">
              <a v-if="entry.archiveUrl" :href="entry.archiveUrl" target="_blank" rel="noopener noreferrer" class="text-primary-700 underline dark:text-primary-300" data-record-archive>{{ t('sources.openArchive') }}</a>
              <NuxtLink :to="`/sources?id=${entry.id}`" class="text-primary-700 underline dark:text-primary-300">{{ t('sources.openDetail') }}</NuxtLink>
            </div>
          </details>
        </li>
      </ul>
    </section>
    <section v-if="associations.length" :class="entries.length ? 'mt-3' : ''" data-person-associations>
      <h4 v-if="compact" :class="heading">{{ t('sources.association.title') }}</h4>
      <div v-else class="mb-2 text-sm opacity-60">{{ t('sources.association.title') }}</div>
      <ul class="flex flex-wrap gap-1.5 text-xs">
        <li v-for="(item, index) in associations" :key="index">
          <button
            type="button"
            class="rounded-full border border-primary-300 bg-primary-50 px-2.5 py-1 text-primary-800 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
            :data-association="item.personId"
            @click="emit('select-person', item.personId)"
          >{{ item.label }}: {{ item.name }}</button>
        </li>
      </ul>
    </section>
  </div>
</template>
