<script setup lang="ts">
// Detail of the person whose marker is selected on the map: years of life, all their events on the map,
// their family and a link to the graphical tree. Names, dates and places respect the anonymous mode.
// Placement: a bottom sheet on phones, a card in the top right corner from `sm` up. The map page keeps it inside the
// part of the map that is on screen through the CSS variables --panel-top, --panel-bottom and --panel-max.
// The file comes as a prop: useGedcomStore() here would reload the tree from the server every time the panel opens.
import type { GedcomFile, MapEvent } from '~~/types/gedcom'
import type { MessageKey } from '~~/i18n'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import { displayName } from '~~/utils/gedcom/treeGraph'
import { formatGedcomDate } from '~~/utils/gedcom/dates'
import { useKnownLocations } from '~~/composables/useKnownLocations'

const props = defineProps<{
  file: GedcomFile | null
  personId: string
  selectedId: string
  /** Events currently shown on the map, grouped by person */
  eventsByPerson: Map<string, MapEvent[]>
  eventLabel: (type: string) => string
}>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select-event', value: MapEvent): void
  (event: 'select-person', id: string): void
}>()

const { t } = useT()
const anon = useAnonymize()
const { settings } = useSettings()
const locale = computed(() => (settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB'))

const file = computed(() => props.file)
const person = computed(() => file.value?.individuals.get(props.personId))

const year = (text = ''): number => Number(text.match(/\b\d{4}\b/)?.[0]) || Number.POSITIVE_INFINITY
// By year; events without a date go last
const events = computed(() => [...(props.eventsByPerson.get(props.personId) ?? [])].sort((a, b) => year(a.date) - year(b.date)))

// A full date is written out in the current language ("17. března 1832"); the anonymous mode keeps only the year
const dateText = (raw = ''): string => (anon.enabled.value ? anon.date(raw) : formatGedcomDate(raw, locale.value))
// Historical map sheets of the event's place (Admin → Known locations); hidden in the anonymous mode with the place
const knownLocations = useKnownLocations()
const archiveMaps = (event: MapEvent) => (anon.enabled.value ? [] : knownLocations.archiveMapsFor(event.place))
const detailLine = (event: MapEvent): string => [dateText(event.date), anon.place(event.place)].filter(Boolean).join(' · ')

const GROUP_LABELS: Record<'parents' | 'partners' | 'children', MessageKey> = {
  parents: 'map.detail.parents',
  partners: 'map.detail.partners',
  children: 'map.detail.children',
}

const family = computed(() => {
  const data = file.value
  const self = person.value
  if (!data || !self) return []
  const unique = (ids: (string | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id && id !== props.personId && data.individuals.has(id)))]
  const families = (ids: string[]) => ids.map(id => data.families.get(id)).filter((value): value is NonNullable<typeof value> => !!value)
  const asChild = families(self.familiesAsChild)
  const asSpouse = families(self.familiesAsSpouse)
  const groups = {
    parents: unique(asChild.flatMap(item => [item.husband, item.wife])),
    partners: unique(asSpouse.map(item => (item.husband === props.personId ? item.wife : item.husband))),
    children: unique(asSpouse.flatMap(item => item.children)),
  }
  return (Object.keys(groups) as (keyof typeof groups)[])
    .filter(key => groups[key].length)
    .map(key => ({
      key,
      label: t(GROUP_LABELS[key]),
      people: groups[key].map(id => ({
        id,
        name: anon.name(displayName(data.individuals.get(id)!)),
        onMap: (props.eventsByPerson.get(id)?.length ?? 0) > 0,
      })),
    }))
})

const avatar = computed(() => {
  if (person.value?.sex === 'M') return { emoji: '👨', color: 'bg-blue-500' }
  if (person.value?.sex === 'F') return { emoji: '👩', color: 'bg-pink-500' }
  return { emoji: '👤', color: 'bg-gray-500' }
})
</script>

<template>
  <aside
    v-if="person"
    data-map-panel
    class="absolute bottom-[var(--panel-bottom,0.75rem)] left-3 right-3 z-[1100] max-h-[min(55%,var(--panel-max,100%))] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:bottom-auto sm:left-auto sm:top-[var(--panel-top,0.75rem)] sm:max-h-[var(--panel-max,calc(100%-1.5rem))] sm:w-96"
    :aria-label="t('map.detail.title')"
  >
    <div class="flex items-start gap-3">
      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl" :class="avatar.color" aria-hidden="true">{{ avatar.emoji }}</span>
      <div class="min-w-0 flex-1">
        <h3 class="break-words text-lg font-bold leading-tight text-gray-900 dark:text-white">{{ anon.name(displayName(person)) }}</h3>
        <p class="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
          <LifespanTips :person="person" hide-empty plain />
        </p>
      </div>
      <button
        type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        :aria-label="t('map.detail.close')"
        @click="emit('close')"
      >×</button>
    </div>

    <section class="mt-4">
      <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ t('map.detail.events') }}</h4>
      <ul class="space-y-1">
        <li v-for="event in events" :key="event.id">
          <button
            type="button"
            class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
            :class="event.id === selectedId ? 'bg-primary-50 ring-1 ring-primary-400 dark:bg-primary-900/30' : ''"
            :aria-current="event.id === selectedId ? 'true' : undefined"
            @click="emit('select-event', event)"
          >
            <span class="text-lg leading-none" aria-hidden="true">{{ event.icon }}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">{{ eventLabel(event.type) }}</span>
              <span v-if="detailLine(event)" class="block break-words text-xs text-gray-600 dark:text-gray-300">{{ detailLine(event) }}</span>
            </span>
          </button>
          <ArchiveMapLinks :maps="archiveMaps(event)" class="ml-9 mt-0.5" />
        </li>
      </ul>
    </section>

    <section v-for="group in family" :key="group.key" class="mt-3">
      <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ group.label }}</h4>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="relative in group.people" :key="relative.id">
          <button
            v-if="relative.onMap"
            type="button"
            class="rounded-full border border-primary-300 bg-primary-50 px-2.5 py-1 text-xs text-primary-800 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200 dark:hover:bg-primary-900/50"
            :title="t('map.detail.showOnMap')"
            @click="emit('select-person', relative.id)"
          >{{ relative.name }}</button>
          <span
            v-else
            class="inline-block rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-600 dark:text-gray-300"
            :title="t('map.detail.notOnMap')"
          >{{ relative.name }}</span>
        </li>
      </ul>
    </section>

    <NuxtLink
      :to="{ path: '/graph', query: { root: personId } }"
      class="mt-4 inline-block text-sm font-medium text-primary-700 underline dark:text-primary-300"
    >{{ t('map.detail.graph') }}</NuxtLink>
  </aside>
</template>
