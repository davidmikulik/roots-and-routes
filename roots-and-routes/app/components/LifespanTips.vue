<script setup lang="ts">
// Years of life ("1914 - 2010"); hovering a year shows the full birth / death date in a bubble.
import type { GedcomEvent } from '~~/types/gedcom'
import { formatGedcomDate } from '~~/utils/gedcom/dates'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'

// Anything with a birth and a death event: an AppPerson or a GedcomIndividual
const props = withDefaults(defineProps<{ person: { birth?: GedcomEvent; death?: GedcomEvent }; focusable?: boolean; hideEmpty?: boolean }>(), { focusable: true, hideEmpty: false })

const { t } = useT()
const anon = useAnonymize()
const { settings } = useSettings()
const locale = computed(() => (settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB'))

const parts = computed(() => {
  const part = (code: 'BIRT' | 'DEAT', event?: GedcomEvent) => {
    const year = event?.date?.parsed?.getFullYear()
    return year ? { code, year, raw: event?.date?.raw || '' } : null
  }
  return [part('BIRT', props.person.birth), part('DEAT', props.person.death)].filter((value): value is NonNullable<typeof value> => value !== null)
})

const tip = (part: { code: 'BIRT' | 'DEAT'; raw: string }): string => {
  // Anonymous mode shows the year only, so the full date must not be revealed
  if (anon.enabled.value || !part.raw) return ''
  return `${part.code === 'BIRT' ? t('tree.event.BIRT') : t('tree.event.DEAT')}: ${formatGedcomDate(part.raw, locale.value)}`
}
</script>

<template>
  <span>
    <template v-if="parts.length">
      <template v-for="(part, index) in parts" :key="part.code">
        <span v-if="index > 0"> - </span>
        <HoverTip :text="tip(part)" :focusable="props.focusable">
          <span :class="tip(part) ? 'cursor-help underline decoration-dotted underline-offset-2' : ''">{{ part.year }}</span>
        </HoverTip>
      </template>
    </template>
    <template v-else-if="!props.hideEmpty">{{ t('tree.na') }}</template>
  </span>
</template>
