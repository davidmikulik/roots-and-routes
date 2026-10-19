<script setup lang="ts">
// All releases with their changes (utils/releaseNotes.ts), linked from Settings → About.
import { useColorMode } from '#imports'
import { useT } from '~~/composables/useT'
import { useReleaseNotes } from '~~/composables/useReleaseNotes'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const { t } = useT()
const notes = useReleaseNotes()
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('releases.title') }}</h1>
        <p class="mt-1 text-lg opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">{{ t('releases.subtitle') }}</p>
      </div>
      <NuxtLink to="/settings?section=about" class="text-sm underline">{{ t('releases.back') }}</NuxtLink>
    </div>
    <div class="max-w-3xl rounded-lg border p-6" :class="{ 'border-gray-700 bg-gray-800': isDark, 'border-gray-200 bg-white': !isDark }">
      <ReleaseNotesList :releases="notes.releases" />
    </div>
  </div>
</template>
