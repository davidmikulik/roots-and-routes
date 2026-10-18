<script setup lang="ts">
// Detail of the person whose marker is selected on the map: the shared PersonDetail.vue with the person's events on
// the map (clickable) and a link to the graphical tree.
// Placement: a bottom sheet on phones, a card in the top right corner from `sm` up. The map page keeps it inside the
// part of the map that is on screen through the CSS variables --panel-top, --panel-bottom and --panel-max.
import type { GedcomFile, MapEvent } from '~~/types/gedcom'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  file: GedcomFile | null
  personId: string
  selectedId: string
  /** Events currently shown on the map, grouped by person */
  eventsByPerson: Map<string, MapEvent[]>
  /** The person is the one chosen in the person filter above the map */
  chosen?: boolean
}>()
const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select-event', value: MapEvent): void
  (event: 'select-person', id: string): void
  // "Choose the person": fills the person filter above the map with this person
  (event: 'choose-person', id: string): void
}>()

const { t } = useT()
const events = computed(() => props.eventsByPerson.get(props.personId) ?? [])
const selectEvent = (event: { id: string }) => {
  const found = events.value.find(candidate => candidate.id === event.id)
  if (found) emit('select-event', found)
}
// A relative can be clicked when they have an event on the map
const relativeState = (id: string) => ((props.eventsByPerson.get(id)?.length ?? 0) > 0
  ? { active: true, title: t('map.detail.showOnMap') }
  : { active: false, title: t('map.detail.notOnMap') })
</script>

<template>
  <aside
    v-if="file?.individuals.has(personId)"
    data-map-panel
    class="absolute bottom-[var(--panel-bottom,0.75rem)] left-3 right-3 z-[1100] max-h-[min(55%,var(--panel-max,100%))] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:bottom-auto sm:left-auto sm:top-[var(--panel-top,0.75rem)] sm:max-h-[var(--panel-max,calc(100%-1.5rem))] sm:w-96"
    :aria-label="t('map.detail.title')"
  >
    <PersonDetail
      :file="file"
      :person-id="personId"
      :events="events"
      selectable-events
      :selected-event-id="selectedId"
      :relative-state="relativeState"
      @close="emit('close')"
      @select-event="selectEvent"
      @select-person="emit('select-person', $event)"
    >
      <template #footer>
        <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            class="rounded border border-primary-300 px-3 py-1 text-sm font-medium text-primary-800 hover:bg-primary-50 disabled:cursor-default disabled:opacity-60 dark:border-primary-700 dark:text-primary-200 dark:hover:bg-primary-900/30"
            :disabled="chosen"
            :title="t('map.detail.chooseHint')"
            data-choose-person
            @click="emit('choose-person', personId)"
          >{{ chosen ? t('map.detail.chosen') : t('map.detail.choose') }}</button>
          <NuxtLink
            :to="{ path: '/graph', query: { root: personId } }"
            class="text-sm font-medium text-primary-700 underline dark:text-primary-300"
          >{{ t('map.detail.graph') }}</NuxtLink>
        </div>
      </template>
    </PersonDetail>
  </aside>
</template>
