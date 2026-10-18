<script setup lang="ts">
// Edit a person or add a relative with the relation filled in (father, mother, partner, child, sibling). Opens the
// shared person editor (composables/usePersonEditor.ts). Administrator only, never on the anonymized data.
import { RELATIONS, type PersonEditor, type Relation } from '~~/composables/usePersonEditor'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'

const props = defineProps<{ editor: PersonEditor; personId: string }>()
const { t } = useT()
const adminAuth = useAdminAuth()

const visible = computed(() => adminAuth.isAdmin.value && props.editor.canEdit.value && !!props.personId)
const available = computed(() => props.editor.availability(props.personId))
const unavailableHint = (relation: Relation): string | undefined =>
  available.value[relation] ? undefined : t(relation === 'sibling' ? 'tree.relation.siblingNeedsParent' : 'tree.relation.parentExists')

const buttonClass = 'rounded border border-gray-300 px-2.5 py-1 text-sm hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600'
</script>

<template>
  <div v-if="visible" class="flex flex-wrap items-center gap-2" data-relation-actions>
    <button type="button" :class="buttonClass" class="font-medium" data-edit-person @click="editor.openEdit(personId)">✎ {{ t('tree.edit') }}</button>
    <span class="ml-1 text-sm opacity-70">{{ t('tree.relation.add') }}</span>
    <button
      v-for="relation in RELATIONS"
      :key="relation"
      type="button"
      :class="buttonClass"
      :disabled="!available[relation]"
      :title="unavailableHint(relation)"
      :data-add-relation="relation"
      @click="editor.openNew(relation, personId)"
    >+ {{ t(`tree.relation.${relation}`) }}</button>
  </div>
</template>
