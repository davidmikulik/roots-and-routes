<script setup lang="ts">
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useSettings } from '~~/composables/useSettings'
import { useAnonymize } from '~~/composables/useAnonymize'
import { useT } from '~~/composables/useT'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { usePersonEditor } from '~~/composables/usePersonEditor'
import { buildTreeNodes, computeLayout, isUnknownPartner } from '~~/utils/gedcom/treeGraph'

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
    name: anon.personName(person),
    person,
    gender: built.value?.unknownSex.has(id) ? ('unknown' as const) : (byId.value.get(id)?.gender ?? ('unknown' as const)),
  }
}
const cardLabel = (id: string) => t('graph.card', { name: cardOf(id).name })

// ---- The person in the middle (chosen in PersonPicker.vue, shared with the map)
const currentLabel = computed(() => (rootId.value ? cardOf(rootId.value).name : ''))
const choose = (id: string) => { if (id) setRoot(id) }

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

// ---- Detail of a person (PersonDetail.vue, the same as on the map) and the right-click menu of a card, with the
// same actions as the buttons above the canvas (composables/usePersonActions.ts)
const detailId = ref('')
const showDetail = (id: string) => { detailId.value = id }
// A relative in the detail moves the tree to them and the detail follows
const detailRelative = (id: string) => {
  setRoot(id)
  detailId.value = id
}
// Clicking a card while the detail is open shows the new person in the detail
watch(rootId, (id) => { if (detailId.value) detailId.value = id })
const relativeState = () => ({ active: true, title: t('graph.detail.moveTo') })

const menu = ref<{ id: string; x: number; y: number } | null>(null)
const openMenu = (value: { id: string; x: number; y: number }) => { menu.value = value }
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
      <NuxtLink v-if="adminAuth.isAdmin.value" to="/gedcom" class="inline-block rounded-lg bg-primary-600 px-8 py-4 text-lg font-medium text-white transition-colors hover:bg-primary-700">
        {{ t('graph.empty.import') }}
      </NuxtLink>
    </div>

    <p v-else-if="!layout" role="alert" class="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {{ t('graph.error') }}
    </p>

    <template v-else>
      <PersonPicker
        class="mb-3 max-w-md"
        :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }"
        input-id="graph-root"
        :file="file"
        :model-value="rootId"
        :label="t('graph.root.label')"
        :placeholder="t('graph.root.placeholder')"
        @update:model-value="choose"
      />

      <div
        class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
        data-graph-edit
      >
        <span class="text-sm">
          <span class="opacity-70">{{ t('graph.edit.selected') }}</span>
          <strong class="ml-1">{{ currentLabel }}</strong>
        </span>
        <PersonActions :editor="editor" :person-id="rootId" detail @detail="showDetail" />
        <button
          v-if="canEdit && gedcomStore.state.value.dirty"
          type="button"
          class="ml-auto rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          data-save-tree
          @click="saveChanges"
        >{{ t('tree.saveToServer') }}</button>
      </div>

      <div class="relative">
        <FamilyTreeChart
          class="h-[70vh] min-h-[320px] w-full"
          :layout="layout"
          :root-id="rootId"
          :card-label="cardLabel"
          @select="setRoot"
          @context="openMenu"
        >
          <template #card="{ node, isRoot }">
            <TreePersonCard
              v-bind="cardOf(node.id)"
              :is-root="isRoot"
              :has-more="node.hasSubTree"
            />
          </template>
        </FamilyTreeChart>

        <!-- Detail: a bottom sheet on phones, a card in the top left corner from `sm` up (the zoom buttons are on the right) -->
        <aside
          v-if="detailId && file?.individuals.has(detailId)"
          class="absolute bottom-3 left-3 right-3 z-30 max-h-[60%] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800 sm:bottom-auto sm:right-auto sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-96"
          :aria-label="t('map.detail.title')"
          data-graph-detail
        >
          <PersonDetail
            :file="file"
            :person-id="detailId"
            :relative-state="relativeState"
            @close="detailId = ''"
            @select-person="detailRelative"
          >
            <template #footer>
              <!-- Visitors get no places, so the map would be empty for them -->
              <NuxtLink
                v-if="adminAuth.isAdmin.value"
                :to="{ path: '/map', query: { person: detailId } }"
                class="mt-4 inline-block text-sm font-medium text-primary-700 underline dark:text-primary-300"
                data-choose-on-map
              >{{ t('graph.detail.chooseOnMap') }}</NuxtLink>
              <PersonActions :editor="editor" :person-id="detailId" class="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700" />
            </template>
          </PersonDetail>
        </aside>
      </div>
    </template>

    <PersonActionsMenu
      v-if="menu"
      :key="`${menu.id}-${menu.x}-${menu.y}`"
      :editor="editor"
      :person-id="menu.id"
      :title="cardOf(menu.id).name"
      :x="menu.x"
      :y="menu.y"
      detail
      @detail="showDetail"
      @close="menu = null"
    />

    <PersonEditor v-if="editor.isOpen.value && canEdit" :editor="editor" />
  </div>
</template>
