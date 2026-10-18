<script setup lang="ts">
// All releases with their changes (utils/releaseNotes.ts). Opening the page marks the latest release as seen, which
// removes the "new" badge on the home page.
import { useColorMode } from '#imports'
import { useT } from '~~/composables/useT'
import { useReleaseNotes } from '~~/composables/useReleaseNotes'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const { t } = useT()
const notes = useReleaseNotes()
onMounted(() => notes.markSeen())
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-8">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('releases.title') }}</h1>
      <p class="mt-1 text-lg opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">{{ t('releases.subtitle') }}</p>
    </div>
    <div class="max-w-3xl rounded-lg border p-6" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
      <ReleaseNotesList :releases="notes.releases" />
    </div>
  </div>
</template>
