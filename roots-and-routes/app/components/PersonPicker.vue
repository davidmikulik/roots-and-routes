<script setup lang="ts">
// Choosing a person by typing: given name, family name (birth or after marriage) and year of birth ("novák 1850"),
// without diacritics, words in any order. The list is sorted by family name and given name. Shared by the graphical
// tree (the person in the middle) and the map (the person filter). The anonymous mode searches only the initials.
// The file comes as a prop: useGedcomStore() in a component would reload the tree from the server on every mount.
import type { GedcomFile } from '~~/types/gedcom'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  file: GedcomFile | null
  modelValue: string
  label: string
  // Shown in the empty field when nobody is chosen
  placeholder: string
  inputId: string
  // A button to clear the choice
  clearable?: boolean
}>()
const emit = defineEmits<{ (event: 'update:modelValue', id: string): void }>()

const { t } = useT()
const anon = useAnonymize()
const { settings } = useSettings()

const query = ref('')
const open = ref(false)
const active = ref(0)

const people = computed(() =>
  [...(props.file?.individuals.values() ?? [])]
    .map((person) => {
      const year = person.birth?.date?.parsed?.getFullYear()
      return { id: person.xrefId, person, year: year ? String(year) : '', label: `${anon.personName(person)}${year ? ` (${year})` : ''}`, key: anon.sortKey(person) }
    })
    .sort((a, b) => a.key.localeCompare(b.key) || a.label.localeCompare(b.label, settings.value.language)),
)
const results = computed(() => {
  const words = query.value.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return people.value.slice(0, 50)
  // A number is the year of birth ("novák 1850"), the other words the name
  const yearWord = words.find(word => /^\d{1,4}$/.test(word))
  const nameQuery = words.filter(word => word !== yearWord).join(' ')
  return people.value.filter(entry => (!yearWord || entry.year.startsWith(yearWord)) && anon.matchesName(entry.person, nameQuery)).slice(0, 50)
})
watch(results, () => { active.value = 0 })

const current = computed(() => people.value.find(entry => entry.id === props.modelValue)?.label ?? '')

const choose = (id: string) => {
  emit('update:modelValue', id)
  query.value = ''
  open.value = false
}
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') { open.value = false; return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    const count = results.value.length
    if (count) active.value = (active.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const entry = results.value[active.value]
    if (entry) choose(entry.id)
  }
}
</script>

<template>
  <div class="relative" data-person-picker>
    <label :for="inputId" class="mb-1 block text-sm font-medium">{{ label }}</label>
    <div class="relative">
      <input
        :id="inputId"
        v-model="query"
        type="search"
        role="combobox"
        autocomplete="off"
        :aria-expanded="open"
        :aria-controls="`${inputId}-results`"
        :aria-activedescendant="open && results[active] ? `${inputId}-${results[active]!.id}` : undefined"
        :placeholder="current || placeholder"
        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-300"
        :class="clearable && modelValue ? 'pr-9' : ''"
        @focus="open = true"
        @input="open = true"
        @blur="open = false"
        @keydown="onKeydown"
      >
      <button
        v-if="clearable && modelValue"
        type="button"
        class="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        :aria-label="t('picker.clear')"
        :title="t('picker.clear')"
        data-picker-clear
        @click="choose('')"
      >×</button>
    </div>
    <ul
      v-if="open"
      :id="`${inputId}-results`"
      role="listbox"
      class="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      <li v-for="(entry, index) in results" :id="`${inputId}-${entry.id}`" :key="entry.id" role="option" :aria-selected="entry.id === modelValue">
        <!-- mousedown, not click: the input's blur would close the list before a click arrives -->
        <button
          type="button"
          class="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
          :class="[entry.id === modelValue ? 'font-semibold' : '', index === active ? 'bg-gray-100 dark:bg-gray-700' : '']"
          @mousedown.prevent="choose(entry.id)"
        >{{ entry.label }}</button>
      </li>
      <li v-if="!results.length" class="px-3 py-2 text-sm opacity-70">{{ t('graph.root.none') }}</li>
    </ul>
  </div>
</template>
