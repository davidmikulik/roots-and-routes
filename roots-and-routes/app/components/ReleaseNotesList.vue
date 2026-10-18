<script setup lang="ts">
// A list of releases with their changes, each marked New / Improved / Fixed. Used by the release notes page, the home
// page (the latest release) and Settings → About.
import type { Release } from '~~/utils/releaseNotes'
import { useReleaseNotes } from '~~/composables/useReleaseNotes'
import { useT } from '~~/composables/useT'

defineProps<{
  releases: Release[]
  // Without the release heading (the caller shows its own)
  hideHeading?: boolean
}>()
const { t } = useT()
const notes = useReleaseNotes()

const KIND_CLASS = {
  new: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  improved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  fixed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
} as const
</script>

<template>
  <div class="space-y-8" data-release-notes>
    <section v-for="release in releases" :key="release.version" :data-release="release.version">
      <header v-if="!hideHeading" class="mb-3">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">
          {{ t('releases.version', { version: release.version }) }} · {{ notes.titleOf(release) }}
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ notes.formatDate(release.date) }}</p>
      </header>
      <ul class="space-y-2">
        <li v-for="(item, index) in release.items" :key="index" class="flex flex-col items-start gap-1 text-sm text-gray-700 dark:text-gray-300 sm:flex-row sm:gap-2">
          <span class="shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold uppercase tracking-wide sm:mt-0.5 sm:w-[5.5rem]" :class="KIND_CLASS[item.kind]">{{ t(`releases.kind.${item.kind}`) }}</span>
          <span>{{ notes.textOf(item) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
