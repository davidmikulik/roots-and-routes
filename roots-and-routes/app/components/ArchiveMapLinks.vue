<script setup lang="ts">
// Links to sheets of historical maps in the ČÚZK archive viewer (císařské otisky, originální mapy stabilního katastru).
// The viewer cannot be embedded (X-Frame-Options: SAMEORIGIN), so every link opens it in a new tab. The source must be
// cited when a reproduction is published, so it is shown under the links.
import type { ParsedArchiveMap } from '~~/utils/gedcom/archiveMaps'
import type { MessageKey } from '~~/i18n'
import { useT } from '~~/composables/useT'

withDefaults(defineProps<{
  maps: ParsedArchiveMap[]
  removable?: boolean
  showSource?: boolean
}>(), { removable: false, showSource: true })
const emit = defineEmits<{ (event: 'remove', index: number): void }>()
const { t } = useT()
const typeLabel = (map: ParsedArchiveMap): string => t(`archive.type.${map.type}` as MessageKey)
</script>

<template>
  <div v-if="maps.length" class="text-xs">
    <ul class="space-y-0.5">
      <li v-for="(map, index) in maps" :key="map.url" class="flex items-start gap-2">
        <a
          :href="map.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('archive.openTitle')"
          class="min-w-0 break-words text-primary-700 underline dark:text-primary-300"
        >🗺 {{ typeLabel(map) }} · {{ map.sheet }} ↗</a>
        <button
          v-if="removable"
          type="button"
          class="shrink-0 text-red-700 dark:text-red-300"
          :aria-label="t('archive.remove', { sheet: map.sheet })"
          @click="emit('remove', index)"
        >&times;</button>
      </li>
    </ul>
    <p v-if="showSource" class="mt-0.5 opacity-60">{{ t('archive.source') }}</p>
  </div>
</template>
