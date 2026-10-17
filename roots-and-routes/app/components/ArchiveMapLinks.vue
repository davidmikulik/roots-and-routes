<script setup lang="ts">
// Links of a place (Admin → Known locations), each opens in a new tab. ČÚZK archive sheets (císařské otisky,
// originální mapy stabilního katastru) are labelled by kind and sheet; the viewer cannot be embedded
// (X-Frame-Options: SAMEORIGIN). The archive must be cited when a reproduction is published, so the source is shown
// under the links when one of them is a ČÚZK sheet. Other links show their title, or the host without one.
import type { ParsedPlaceLink } from '~~/utils/gedcom/archiveMaps'
import type { MessageKey } from '~~/i18n'
import { useT } from '~~/composables/useT'

const props = withDefaults(defineProps<{
  maps: ParsedPlaceLink[]
  removable?: boolean
  showSource?: boolean
}>(), { removable: false, showSource: true })
const emit = defineEmits<{ (event: 'remove', index: number): void }>()
const { t } = useT()
const label = (map: ParsedPlaceLink): string => {
  if (map.title) return map.title
  if (map.archive) return `${t(`archive.type.${map.archive.type}` as MessageKey)} · ${map.archive.sheet}`
  return map.host
}
const hasArchive = computed(() => props.maps.some(map => map.archive))
</script>

<template>
  <div v-if="maps.length" class="text-xs">
    <ul class="space-y-0.5">
      <li v-for="(map, index) in maps" :key="map.url" class="flex items-start gap-2">
        <a
          :href="map.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="map.archive ? t('archive.openTitle') : t('archive.openLink', { url: map.url })"
          class="min-w-0 break-words text-primary-700 underline dark:text-primary-300"
        >{{ map.archive ? '🗺' : '🔗' }} {{ label(map) }} ↗</a>
        <button
          v-if="removable"
          type="button"
          class="shrink-0 rounded border border-red-300 px-1.5 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
          :aria-label="t('archive.remove', { sheet: label(map) })"
          @click="emit('remove', index)"
        >{{ t('archive.removeButton') }}</button>
      </li>
    </ul>
    <p v-if="showSource && hasArchive" class="mt-0.5 opacity-60">{{ t('archive.source') }}</p>
  </div>
</template>
