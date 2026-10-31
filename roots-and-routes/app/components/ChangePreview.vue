<script setup lang="ts">
// The "was / will be" overview of changes (utils/gedcom/changes.ts describeChanges): one block per changed record
// (person, family, source…) with the changed fields. Used by the pages Pending changes and History.
import type { ChangePreviewItem } from '~~/utils/gedcom/changes'
import { useT } from '~~/composables/useT'
import { messages, type MessageKey } from '~~/i18n'

defineProps<{ items: ChangePreviewItem[]; wasLabel?: string; willLabel?: string }>()
const { t } = useT()

const fieldLabel = (field: string): string => {
  const [base, number] = field.split('#')
  for (const key of [`changes.field.${base}`, `tree.event.${base}`]) {
    if (key in messages.en) return `${t(key as MessageKey)}${number ? ` ${number}` : ''}`
  }
  return field
}
const ACTION_CLASS: Record<ChangePreviewItem['action'], string> = {
  added: 'border-green-400 dark:border-green-700',
  changed: 'border-amber-400 dark:border-amber-700',
  removed: 'border-red-400 dark:border-red-700',
}
</script>

<template>
  <div class="space-y-2" data-change-preview>
    <p v-if="!items.length" class="text-sm opacity-70">{{ t('changes.noChanges') }}</p>
    <article v-for="item in items" :key="`${item.kind}:${item.id}`" class="rounded border-l-4 bg-black/[0.02] p-2 dark:bg-white/[0.03]" :class="ACTION_CLASS[item.action]" :data-preview-record="`${item.kind}:${item.id}`">
      <header class="mb-1 text-sm">
        <span class="font-semibold">{{ item.label }}</span>
        <span class="ml-2 text-xs opacity-70">{{ t(`changes.kind.${item.kind}` as MessageKey) }} · {{ t(`changes.action.${item.action}` as MessageKey) }}</span>
      </header>
      <div class="overflow-x-auto">
        <table v-if="item.fields.length" class="w-full text-xs">
          <thead>
            <tr class="text-left opacity-70">
              <th class="w-1/5 pr-2 font-normal">{{ t('changes.column.field') }}</th>
              <th class="w-2/5 pr-2 font-normal">{{ wasLabel || t('changes.was') }}</th>
              <th class="w-2/5 font-normal">{{ willLabel || t('changes.will') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in item.fields" :key="field.field" class="align-top">
              <td class="pr-2 font-medium">{{ fieldLabel(field.field) }}</td>
              <td class="whitespace-pre-wrap break-words pr-2 text-red-800 line-through decoration-red-400/60 dark:text-red-300" :class="{ 'no-underline opacity-50': !field.before }">{{ field.before || '—' }}</td>
              <td class="whitespace-pre-wrap break-words text-green-800 dark:text-green-300">{{ field.after || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </div>
</template>
