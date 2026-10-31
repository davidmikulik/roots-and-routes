<script setup lang="ts">
// Detail of a person, shared by the map (MapPersonPanel.vue) and the graphical tree: name, years of life, events,
// parents, partners and children. Names, dates and places respect the anonymous mode. The caller places it (card,
// bottom sheet) and adds its own links in the `footer` slot.
// The file comes as a prop: useGedcomStore() in a component would reload the tree from the server on every mount.
import type { GedcomEvent, GedcomFile } from '~~/types/gedcom'
import { messages, type MessageKey } from '~~/i18n'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import { formatGedcomDate } from '~~/utils/gedcom/dates'
import { eventStyle } from '~~/utils/gedcom/eventStyles'
import { useKnownLocations } from '~~/composables/useKnownLocations'

// One line in the list of events (the map passes its markers, otherwise all events of the person are listed)
export interface DetailEvent { id: string; type: string; icon?: string; date?: string; place?: string; description?: string; cause?: string }

const props = defineProps<{
  file: GedcomFile | null
  personId: string
  /** Events to list; without it every event of the person (and of their marriages) is listed */
  events?: DetailEvent[]
  /** Events can be clicked (the map selects the marker) */
  selectableEvents?: boolean
  selectedEventId?: string
  /** Whether a relative can be clicked, and the tooltip; all relatives can be clicked without it */
  relativeState?: (id: string) => { active: boolean; title?: string }
}>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select-event', value: DetailEvent): void
  (event: 'select-person', id: string): void
}>()

const { t } = useT()
const anon = useAnonymize()
const { settings } = useSettings()
const locale = computed(() => (settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB'))

const person = computed(() => props.file?.individuals.get(props.personId))

const eventLabel = (type: string): string => {
  for (const key of [`map.event.${type}`, `tree.event.${type}`]) if (key in messages.en) return t(key as MessageKey)
  return type
}

// All events of the person and of their marriages (when the caller gives none)
const ownEvents = computed<DetailEvent[]>(() => {
  const data = props.file
  const self = person.value
  if (!data || !self) return []
  const list: (GedcomEvent | undefined)[] = [self.birth, self.baptism, self.christening, self.death, self.burial, self.cremation, ...self.events]
  for (const familyId of self.familiesAsSpouse) {
    const family = data.families.get(familyId)
    if (family) list.push(family.marriage, family.divorce, ...(family.engagements || []))
  }
  return list
    .filter((event): event is GedcomEvent => !!event)
    .map((event, index) => ({ id: `${index}-${event.type}`, type: event.type, date: event.date?.raw, place: event.place, description: event.description, cause: event.cause }))
})

const year = (text = ''): number => Number(text.match(/\b\d{4}\b/)?.[0]) || Number.POSITIVE_INFINITY
// By year; events without a date go last
const events = computed(() => [...(props.events ?? ownEvents.value)].sort((a, b) => year(a.date) - year(b.date)))

// A full date is written out in the current language ("17. března 1832"); the anonymous mode keeps only the year
const dateText = (raw = ''): string => (anon.enabled.value ? anon.date(raw) : formatGedcomDate(raw, locale.value))
// Historical map sheets of the event's place (Admin → Known locations); hidden in the anonymous mode with the place
const knownLocations = useKnownLocations()
const archiveMaps = (event: DetailEvent) => (anon.enabled.value ? [] : knownLocations.archiveMapsFor(event.place))
// The description ("Švadlena" for an occupation) is personal data like the place: hidden in the anonymous mode
const detailLine = (event: DetailEvent): string => [anon.place(event.description), dateText(event.date), anon.place(event.place)].filter(Boolean).join(' · ')
// Cause of death on its own line ("Příčina: tuberkulóza"); hidden in the anonymous mode
const causeLine = (event: DetailEvent): string => (event.cause && !anon.enabled.value ? t('map.detail.cause', { cause: event.cause }) : '')

const GROUP_LABELS: Record<'parents' | 'partners' | 'children', MessageKey> = {
  parents: 'map.detail.parents',
  partners: 'map.detail.partners',
  children: 'map.detail.children',
}

const family = computed(() => {
  const data = props.file
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
      people: groups[key].map(id => ({ id, name: anon.personName(data.individuals.get(id)), ...(props.relativeState?.(id) ?? { active: true }) })),
    }))
})

// Living or deceased (a death event, also without a date); without a death record the person is living
const livingText = computed(() => {
  const self = person.value
  if (!self || anon.enabled.value) return ''
  if (self.death) return t(self.sex === 'M' ? 'tree.living.wasM' : self.sex === 'F' ? 'tree.living.wasF' : 'tree.living.was')
  return t('tree.living.isLiving')
})

const avatar = computed(() => {
  if (person.value?.sex === 'M') return { emoji: '👨', color: 'bg-blue-500' }
  if (person.value?.sex === 'F') return { emoji: '👩', color: 'bg-pink-500' }
  return { emoji: '👤', color: 'bg-gray-500' }
})
</script>

<template>
  <div v-if="person" data-person-detail>
    <div class="flex items-start gap-3">
      <span class="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl" :class="avatar.color" aria-hidden="true">{{ avatar.emoji }}</span>
      <div class="min-w-0 flex-1">
        <h3 class="break-words text-lg font-bold leading-tight text-gray-900 dark:text-white">{{ anon.personName(person) }}</h3>
        <p class="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
          <LifespanTips :person="person" hide-empty plain />
          <span v-if="livingText" class="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700" data-living>{{ livingText }}</span>
          <span class="ml-1 whitespace-nowrap">· <PersonAge :person="person" /></span>
        </p>
      </div>
      <button
        type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        :aria-label="t('map.detail.close')"
        data-detail-close
        @click="emit('close')"
      >×</button>
    </div>

    <section v-if="events.length" class="mt-4">
      <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ selectableEvents ? t('map.detail.events') : t('map.detail.allEvents') }}</h4>
      <ul class="space-y-1">
        <li v-for="event in events" :key="event.id">
          <component
            :is="selectableEvents ? 'button' : 'div'"
            :type="selectableEvents ? 'button' : undefined"
            class="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left"
            :class="[
              selectableEvents ? 'hover:bg-gray-100 dark:hover:bg-gray-700' : '',
              event.id === selectedEventId ? 'bg-primary-50 ring-1 ring-primary-400 dark:bg-primary-900/30' : '',
            ]"
            :aria-current="event.id === selectedEventId ? 'true' : undefined"
            @click="selectableEvents && emit('select-event', event)"
          >
            <span class="text-lg leading-none" aria-hidden="true">{{ event.icon || eventStyle(event.type).icon }}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">{{ eventLabel(event.type) }}</span>
              <span v-if="detailLine(event)" class="block break-words text-xs text-gray-600 dark:text-gray-300">{{ detailLine(event) }}</span>
              <span v-if="causeLine(event)" class="block break-words text-xs text-gray-600 dark:text-gray-300" data-death-cause>{{ causeLine(event) }}</span>
            </span>
          </component>
          <ArchiveMapLinks :maps="archiveMaps(event)" class="ml-9 mt-0.5" />
        </li>
      </ul>
    </section>

    <section v-for="group in family" :key="group.key" class="mt-3">
      <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ group.label }}</h4>
      <ul class="flex flex-wrap gap-1.5">
        <li v-for="relative in group.people" :key="relative.id">
          <button
            v-if="relative.active"
            type="button"
            class="rounded-full border border-primary-300 bg-primary-50 px-2.5 py-1 text-xs text-primary-800 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200 dark:hover:bg-primary-900/50"
            :title="relative.title"
            :data-relative="relative.id"
            @click="emit('select-person', relative.id)"
          >{{ relative.name }}</button>
          <span
            v-else
            class="inline-block rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-600 dark:text-gray-300"
            :title="relative.title"
          >{{ relative.name }}</span>
        </li>
      </ul>
    </section>

    <PersonSourceRecords :file="file" :person-id="personId" compact class="mt-3" @select-person="emit('select-person', $event)" />
    <PersonSources :file="file" :person-id="personId" compact class="mt-3" />
    <PersonLinks :file="file" :person-id="personId" compact class="mt-3" />

    <slot name="footer" />
  </div>
</template>
