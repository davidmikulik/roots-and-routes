<script setup lang="ts">
// The actions on one person as a row of buttons: detail, edit, add a father / mother / partner / child / sibling.
// The same actions as the right-click menu (PersonActionsMenu.vue), both from composables/usePersonActions.ts.
import type { PersonEditor } from '~~/composables/usePersonEditor'
import { usePersonActions } from '~~/composables/usePersonActions'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  editor?: PersonEditor | null
  personId: string
  // Offers "Detail" (the page shows it on the `detail` event)
  detail?: boolean
}>()
const emit = defineEmits<{ (event: 'detail', id: string): void }>()
const { t } = useT()

const actions = usePersonActions({
  editor: props.editor,
  personId: () => props.personId,
  onDetail: props.detail ? id => emit('detail', id) : undefined,
})

const buttonClass = 'rounded border border-gray-300 px-2.5 py-1 text-sm hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600'
</script>

<template>
  <div v-if="actions.length" class="flex flex-wrap items-center gap-2" data-person-actions>
    <template v-for="action in actions" :key="action.key">
      <span v-if="action.group === 'add'" class="ml-1 text-sm opacity-70">{{ t('tree.relation.add') }}</span>
      <button
        type="button"
        :class="[buttonClass, action.key === 'edit' || action.key === 'detail' ? 'font-medium' : '']"
        :disabled="action.disabled"
        :title="action.hint"
        :data-action="action.key"
        @click="action.run()"
      >{{ action.icon }} {{ action.label }}</button>
    </template>
  </div>
</template>
