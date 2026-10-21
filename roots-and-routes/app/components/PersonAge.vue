<script setup lang="ts">
// Age of a person (utils/gedcom/age.ts): the current age of a living person (everybody without a death record), the
// length of life of a deceased one, "?" when a date is missing. "asi" (about) for incomplete or uncertain dates. `compact`: only the number (lists,
// cards), the meaning is in the tooltip.
import type { GedcomEvent } from '~~/types/gedcom'
import { personAge } from '~~/utils/gedcom/age'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  person: { birth?: GedcomEvent; death?: GedcomEvent }
  compact?: boolean
}>()
const { t } = useT()

const age = computed(() => personAge(props.person))
const number = computed(() => (age.value.years === undefined ? '?' : age.value.approximate ? t('tree.age.approx', { n: age.value.years }) : String(age.value.years)))
const text = computed(() => {
  if (age.value.kind === 'unknown') return t('tree.age.unknown')
  return t(age.value.kind === 'living' ? 'tree.age.living' : 'tree.age.lifespan', { age: number.value })
})
const title = computed(() => (age.value.kind === 'unknown' ? t('tree.age.unknownHint') : text.value))
</script>

<template>
  <span :title="title" :data-age="age.kind">{{ compact ? number : text }}</span>
</template>
