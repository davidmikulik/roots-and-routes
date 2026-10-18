<script setup lang="ts">
// A date of an event as GEDCOM text (v-model): a qualifier (exactly, about, before, after…), an optional day and month,
// and a year, so "1850", "MAR 1850" and "ABT 4 MAR 1850" can all be entered. Dates that cannot be entered by parts
// (a range "BET 1850 AND 1860", a phrase) are edited as text and kept as they are. Used by the person editor.
import { DATE_QUALIFIERS, daysInMonth, formatGedcomDate, joinGedcomDate, splitGedcomDate, type DateParts } from '~~/utils/gedcom/dates'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const props = defineProps<{ modelValue: string; label: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const { t } = useT()
const { settings } = useSettings()
const locale = computed(() => (settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB'))

const empty = (): DateParts => ({ qualifier: '', day: '', month: '', year: '' })
const parts = ref<DateParts>(splitGedcomDate(props.modelValue) ?? empty())
// Text mode for dates the parts cannot express
const asText = ref(splitGedcomDate(props.modelValue) === null)
const text = ref(props.modelValue)

// The draft can be replaced from outside (another person opened); follow it unless it is what this input produced
watch(() => props.modelValue, (value) => {
  if (asText.value ? value === text.value : value === joinGedcomDate(parts.value)) return
  const split = splitGedcomDate(value)
  asText.value = split === null
  parts.value = split ?? empty()
  text.value = value
})

const monthNames = computed(() => Array.from({ length: 12 }, (_, index) =>
  new Date(Date.UTC(2000, index, 1)).toLocaleDateString(locale.value, { timeZone: 'UTC', month: 'long' })))
const dayCount = computed(() => {
  const month = Number(parts.value.month)
  if (!month) return 31
  return daysInMonth(Number(parts.value.year) || 2000, month - 1)
})

const update = (change: Partial<DateParts>) => {
  const next = { ...parts.value, ...change }
  if (!next.month) next.day = ''
  if (Number(next.day) > dayCount.value) next.day = ''
  parts.value = next
  emit('update:modelValue', joinGedcomDate(next))
}
// Re-check the day when the month or year makes it impossible (31 → February)
watch(dayCount, (count) => { if (Number(parts.value.day) > count) update({ day: '' }) })

const updateText = (value: string) => {
  text.value = value
  emit('update:modelValue', value.trim())
}
const switchMode = () => {
  if (asText.value) {
    const split = splitGedcomDate(text.value)
    parts.value = split ?? empty()
    asText.value = false
    emit('update:modelValue', joinGedcomDate(parts.value))
  } else {
    text.value = joinGedcomDate(parts.value)
    asText.value = true
  }
}

const needsYear = computed(() => !asText.value && !parts.value.year.trim() && !!(parts.value.month || parts.value.qualifier))
const preview = computed(() => formatGedcomDate(props.modelValue, locale.value))
const controlClass = 'rounded border px-2 py-2 bg-transparent'
</script>

<template>
  <div class="text-sm" data-date-input>
    <div class="flex items-center justify-between gap-2">
      <span>{{ label }}</span>
      <button type="button" class="text-xs text-primary-700 underline dark:text-primary-300" data-date-mode @click="switchMode">
        {{ asText ? t('date.byParts') : t('date.asText') }}
      </button>
    </div>
    <input
      v-if="asText"
      :value="text"
      class="mt-1 w-full rounded border px-3 py-2 bg-transparent"
      :aria-label="label"
      :placeholder="t('date.textPlaceholder')"
      data-date-text
      @input="updateText(($event.target as HTMLInputElement).value)"
    >
    <div v-else class="mt-1 flex flex-wrap gap-1.5">
      <select :value="parts.qualifier" :class="controlClass" class="w-[6.5rem] flex-none" :aria-label="`${label}: ${t('date.qualifier')}`" data-date-qualifier @change="update({ qualifier: ($event.target as HTMLSelectElement).value as DateParts['qualifier'] })">
        <option v-for="qualifier in DATE_QUALIFIERS" :key="qualifier" :value="qualifier">{{ t(`date.q.${qualifier || 'exact'}` as MessageKey) }}</option>
      </select>
      <select :value="parts.day" :class="controlClass" class="w-[5rem] flex-none" :disabled="!parts.month" :aria-label="`${label}: ${t('date.day')}`" data-date-day @change="update({ day: ($event.target as HTMLSelectElement).value })">
        <option value="">{{ t('date.day') }}</option>
        <option v-for="day in dayCount" :key="day" :value="String(day)">{{ day }}.</option>
      </select>
      <select :value="parts.month" :class="controlClass" class="min-w-[8.5rem] flex-1" :aria-label="`${label}: ${t('date.month')}`" data-date-month @change="update({ month: ($event.target as HTMLSelectElement).value })">
        <option value="">{{ t('date.month') }}</option>
        <option v-for="(name, index) in monthNames" :key="index" :value="String(index + 1)">{{ name }}</option>
      </select>
      <input
        :value="parts.year"
        type="text"
        inputmode="numeric"
        maxlength="4"
        :class="controlClass"
        class="!w-[5.5rem] flex-none"
        :placeholder="t('date.year')"
        :aria-label="`${label}: ${t('date.year')}`"
        data-date-year
        @input="update({ year: ($event.target as HTMLInputElement).value.replace(/\D/g, '') })"
      >
    </div>
    <p v-if="needsYear" class="mt-1 text-xs text-amber-700 dark:text-amber-300">{{ t('date.needsYear') }}</p>
    <p v-else-if="preview && (asText || parts.qualifier || !parts.day)" class="mt-1 text-xs opacity-70" data-date-preview>{{ preview }}</p>
  </div>
</template>
