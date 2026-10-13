<script setup lang="ts">
// One person card of the graphical tree (visual only; the chart makes it clickable and focusable).
import type { GedcomEvent } from '~~/types/gedcom'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  name: string
  /** Missing for the invented "unknown partner" card */
  person?: { birth?: GedcomEvent; death?: GedcomEvent }
  gender: 'male' | 'female' | 'unknown'
  isRoot: boolean
  /** The person has relatives outside the shown part of the tree */
  hasMore: boolean
  placeholder: boolean
}>()

const { t } = useT()

const frame = computed(() => {
  if (props.placeholder) return 'border-2 border-dashed border-gray-300 bg-white/60 dark:border-gray-600 dark:bg-gray-800/60'
  const color = props.gender === 'male' ? 'border-cyan-500' : props.gender === 'female' ? 'border-rose-300' : 'border-gray-400'
  const width = props.isRoot ? 'border-[3px] shadow-lg' : 'border-2 shadow-sm'
  return `${width} ${color} bg-white dark:bg-gray-800`
})
</script>

<template>
  <div class="relative flex h-full w-full items-center gap-2 rounded-lg px-2" :class="frame">
    <span class="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-gray-600 dark:bg-gray-700">
      <span v-if="placeholder" class="text-2xl font-light text-gray-400 dark:text-gray-500" aria-hidden="true">?</span>
      <svg v-else viewBox="0 0 56 56" class="h-full w-full text-gray-300 dark:text-gray-500" fill="currentColor" aria-hidden="true">
        <path v-if="gender === 'female'" d="M15 27c0-10 5-18 13-18s13 8 13 18v12c-2 2-4 3-7 3V28H22v14c-3 0-5-1-7-3z" />
        <circle cx="28" cy="24" r="9" />
        <path d="M9 56c0-11 8-19 19-19s19 8 19 19z" />
      </svg>
    </span>
    <span class="min-w-0 flex-1">
      <span
        class="block break-words text-[13px] font-bold leading-tight line-clamp-3"
        :class="placeholder ? 'font-normal italic text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'"
      >{{ name }}</span>
      <span v-if="person" class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
        <LifespanTips :person="person" :focusable="false" hide-empty />
      </span>
    </span>
    <span
      v-if="hasMore"
      class="absolute -bottom-2.5 left-1/2 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full border border-gray-300 bg-white text-xs leading-none text-gray-500 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
      :title="t('graph.moreRelatives')"
      aria-hidden="true"
    >⌄</span>
  </div>
</template>
