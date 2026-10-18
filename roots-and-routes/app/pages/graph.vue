<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useSettings } from '~~/composables/useSettings'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useT } from '~~/composables/useT'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { usePersonEditor } from '~~/composables/usePersonEditor'
import { buildTreeNodes, computeLayout, displayName, isUnknownPartner } from '~~/utils/gedcom/treeGraph'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const { t } = useT()
const anon = useAnonymize()
const appSettings = useSettings()
const gedcomStore = useGedcomStore()
const route = useRoute()
const router = useRouter()

// Data comes from the server after the page is shown; until then the loading text is displayed
const loaded = ref(gedcomStore.hasData.value)
onMounted(async () => {
  if (!gedcomStore.hasData.value) await gedcomStore.refreshFromServer()
  loaded.value = true
})

const file = computed(() => gedcomStore.state.value.file)
const built = computed(() => (file.value ? buildTreeNodes(file.value) : null))
const byId = computed(() => new Map((built.value?.nodes ?? []).map(node => [node.id, node])))

// The person in the middle: ?root=<id>, otherwise the first person in the file (like the Tree page)
const rootId = computed(() => {
  const wanted = typeof route.query.root === 'string' ? route.query.root : ''
  if (wanted && file.value?.individuals.has(wanted)) return wanted
  return file.value ? (file.value.individuals.keys().next().value ?? '') : ''
})

const result = computed(() => {
  if (!built.value || !rootId.value) return null
  try {
    return { layout: computeLayout(built.value.nodes, rootId.value, appSettings.settings.value.tree.maxGenerations) }
  } catch (error) {
    console.error('[GRAPH] Layout failed:', error)
    return { error: true as const }
  }
})
const layout = computed(() => (result.value && 'layout' in result.value ? result.value.layout : null))

const setRoot = (id: string) => {
  // push, not replace: the browser's Back button then walks back through the people visited
  if (id !== rootId.value) router.push({ query: { ...route.query, root: id } })
}

// What a card shows. The anonymous mode applies to the name and (inside LifespanTips) to the dates.
const cardOf = (id: string) => {
  const person = file.value?.individuals.get(id)
  if (isUnknownPartner(id) || !person) return { placeholder: true, name: t('graph.unknownPerson'), person: undefined, gender: 'unknown' as const }
  return {
    placeholder: false,
    name: anon.name(displayName(person)),
    person,
    gender: built.value?.unknownSex.has(id) ? ('unknown' as const) : (byId.value.get(id)?.gender ?? ('unknown' as const)),
  }
}
const cardLabel = (id: string) => t('graph.card', { name: cardOf(id).name })

// ---- Choosing the person in the middle
const query = ref('')
const pickerOpen = ref(false)
const people = computed(() =>
  [...(file.value?.individuals.values() ?? [])]
    .map((person) => {
      const year = person.birth?.date?.parsed?.getFullYear()
      return { id: person.xrefId, label: `${anon.name(displayName(person))}${year ? ` (${year})` : ''}` }
    })
    .sort((a, b) => a.label.localeCompare(b.label, appSettings.settings.value.language)),
)
const results = computed(() => {
  const text = query.value.trim().toLowerCase()
  return (text ? people.value.filter(person => person.label.toLowerCase().includes(text)) : people.value).slice(0, 50)
})
const currentLabel = computed(() => (rootId.value ? cardOf(rootId.value).name : ''))
const choose = (id: string) => {
  setRoot(id)
  query.value = ''
  pickerOpen.value = false
}

// ---- Editing (administrator): the person in the middle can be edited and get new relatives, in the editor shared
// with the Tree page (docs/graficky-strom-editace.md). The middle person stays; a new relative appears around them.
const adminAuth = useAdminAuth()
const editor = usePersonEditor(gedcomStore)
const canEdit = computed(() => adminAuth.isAdmin.value && editor.canEdit.value)
const saveChanges = async () => {
  try {
    await gedcomStore.saveNow()
  } catch (error) {
    window.alert(t('tree.savingFailed', { error: editor.errorText(error) }))
  }
}

</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        {{ t('graph.title') }}
      </h1>
      <p class="mt-1 text-lg opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        {{ t('graph.subtitle') }}
      </p>
    </div>

    <p v-if="!loaded" class="p-12 text-center opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
      {{ t('graph.loading') }}
    </p>

    <div v-else-if="!gedcomStore.hasData.value" class="rounded-lg p-12 text-center" :class="{ 'bg-gray-800': isDark, 'bg-gray-100': !isDark }">
      <div class="mb-4 text-4xl">🌳</div>
      <h3 class="mb-2 text-xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('graph.empty.title') }}</h3>
      <p class="mb-6 text-lg opacity-75" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">{{ t('graph.empty.text') }}</p>
      <NuxtLink to="/gedcom" class="inline-block rounded-lg bg-primary-600 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-primary-700">
        {{ t('graph.empty.import') }}
      </NuxtLink>
    </div>

    <p v-else-if="!layout" role="alert" class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {{ t('graph.error') }}
    </p>

    <template v-else>
      <div class="relative mb-3 max-w-md">
        <label for="graph-root" class="mb-1 block text-sm font-medium" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
          {{ t('graph.root.label') }}
        </label>
        <input
          id="graph-root"
          v-model="query"
          type="search"
          role="combobox"
          autocomplete="off"
          :aria-expanded="pickerOpen"
          aria-controls="graph-root-results"
          :placeholder="currentLabel || t('graph.root.placeholder')"
          class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-300"
          @focus="pickerOpen = true"
          @input="pickerOpen = true"
          @blur="pickerOpen = false"
          @keydown.escape="pickerOpen = false"
          @keydown.enter.prevent="results[0] && choose(results[0].id)"
        >
        <ul
          v-if="pickerOpen"
          id="graph-root-results"
          role="listbox"
          class="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <li v-for="person in results" :key="person.id" role="option" :aria-selected="person.id === rootId">
            <!-- mousedown, not click: the input's blur would close the list before a click arrives -->
            <button
              type="button"
              class="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
              :class="person.id === rootId ? 'font-semibold' : ''"
              @mousedown.prevent="choose(person.id)"
            >{{ person.label }}</button>
          </li>
          <li v-if="!results.length" class="px-3 py-2 text-sm opacity-70">{{ t('graph.root.none') }}</li>
        </ul>
      </div>

      <div
        v-if="canEdit"
        class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        data-graph-edit
      >
        <span class="text-sm">
          <span class="opacity-70">{{ t('graph.edit.selected') }}</span>
          <strong class="ml-1">{{ currentLabel }}</strong>
        </span>
        <PersonRelationActions :editor="editor" :person-id="rootId" />
        <button
          v-if="gedcomStore.state.value.dirty"
          type="button"
          class="ml-auto rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          data-save-tree
          @click="saveChanges"
        >{{ t('tree.saveToServer') }}</button>
      </div>

      <FamilyTreeChart
        class="h-[70vh] min-h-[320px] w-full"
        :layout="layout"
        :root-id="rootId"
        :card-label="cardLabel"
        @select="setRoot"
      >
        <template #card="{ node, isRoot }">
          <TreePersonCard
            v-bind="cardOf(node.id)"
            :is-root="isRoot"
            :has-more="node.hasSubTree"
          />
        </template>
      </FamilyTreeChart>
    </template>

    <PersonEditor v-if="editor.isOpen.value && canEdit" :editor="editor" />
  </div>
</template>
