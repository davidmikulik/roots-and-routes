<script setup lang="ts">
// Sources of one fact in the person editor (name, sex, birth, death, marriage, an event): any of the person's links
// and attachments, or a new one (it is added to the links below, where its address or file and description are
// filled in). The value is the list of link keys (LinkDraft.key), see FactSources in composables/useGedcomStore.ts.
import type { LinkDraft } from '~~/composables/useGedcomStore'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  modelValue: string[]
  links: LinkDraft[]
  // Adds a new empty link to the person and returns its key
  createLink: () => string
  // What the sources are of, for screen readers ("Narození")
  fact: string
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>()
const { t } = useT()

const NEW = '__new__'
const label = (link: LinkDraft): string => link.title.trim() || link.url.trim() || t('tree.sources.untitled')
const chosen = computed(() => props.modelValue
  .map(key => props.links.find(link => link.key === key))
  .filter((link): link is LinkDraft => !!link))
const available = computed(() => props.links.filter(link => link.key && !props.modelValue.includes(link.key)))

const choose = (event: Event) => {
  const select = event.target as HTMLSelectElement
  const value = select.value
  select.value = ''
  if (!value) return
  const key = value === NEW ? props.createLink() : value
  emit('update:modelValue', [...props.modelValue, key])
}
const remove = (key?: string) => emit('update:modelValue', props.modelValue.filter(item => item !== key))
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 text-xs" data-source-picker>
    <span class="opacity-70">{{ t('tree.sources.label') }}:</span>
    <span
      v-for="link in chosen"
      :key="link.key"
      class="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-primary-800 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-200"
      data-source-chip
    >
      <span aria-hidden="true">{{ link.file ? '📎' : '🔗' }}</span>
      <span class="truncate">{{ label(link) }}</span>
      <button type="button" class="leading-none" :aria-label="t('tree.sources.remove', { name: label(link) })" @click="remove(link.key)">&times;</button>
    </span>
    <select
      class="!w-auto max-w-[14rem] rounded border bg-transparent px-1.5 py-0.5"
      :aria-label="t('tree.sources.addFor', { fact })"
      data-source-add
      @change="choose"
    >
      <option value="">{{ t('tree.sources.add') }}</option>
      <option v-for="link in available" :key="link.key" :value="link.key" class="text-gray-900">{{ label(link) }}</option>
      <option :value="NEW" class="text-gray-900">{{ t('tree.sources.newLink') }}</option>
    </select>
  </div>
</template>
