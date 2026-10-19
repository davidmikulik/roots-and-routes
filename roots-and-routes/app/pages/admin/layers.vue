<script setup lang="ts">
// Admin → Map layers: custom historical map layers made of uploaded scanned sheets (docs/vlastni-vrstvy-navrh.md).
// A layer has a title and any number of sheets; each sheet is placed onto the map by its own control points.
// Every change is saved right away.
import { useColorMode } from '#imports'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import { useMapLayers } from '~~/composables/useMapLayers'
import { useKnownLocations } from '~~/composables/useKnownLocations'
import type { CustomLayer, MapSheet } from '~~/types/mapLayers'
import { affineFromPoints, residuals } from '~~/utils/map/affine'
import { MAX_LAYERS, MAX_SHEETS, MAX_TITLE, MIN_POINTS, newLayerId } from '~~/utils/map/mapLayers'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const { t } = useT()
const adminAuth = useAdminAuth()
const mapLayers = useMapLayers()
mapLayers.autoLoad()
const knownLocations = useKnownLocations()
knownLocations.autoLoad()

const layers = computed(() => mapLayers.layers.value || [])
const isSaving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const newTitle = ref('')
// Edited titles of the layers, by layer id (saved with "Save title")
const titleDrafts = ref<Record<string, string>>({})
const titleOf = (layer: CustomLayer) => titleDrafts.value[layer.id] ?? layer.title

const cardClass = computed(() => (isDark.value ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'))

const errorText = (error: any) => error?.data?.statusMessage || error?.message || t('layers.error.save')

// Saves a changed copy of the list; the shown list changes only when the save succeeded
const persist = async (next: CustomLayer[], success: string): Promise<boolean> => {
  isSaving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await mapLayers.save(next)
    successMessage.value = success
    return true
  } catch (error: any) {
    errorMessage.value = errorText(error)
    return false
  } finally {
    isSaving.value = false
  }
}

const copy = (): CustomLayer[] => structuredClone(toRaw(layers.value))
const withLayer = (id: string, change: (layer: CustomLayer) => CustomLayer): CustomLayer[] =>
  copy().map(layer => (layer.id === id ? change(layer) : layer))

const addLayer = async () => {
  const title = newTitle.value.trim()
  if (!title) { errorMessage.value = t('layers.error.titleRequired'); return }
  if (layers.value.length >= MAX_LAYERS) { errorMessage.value = t('layers.error.tooMany', { n: MAX_LAYERS }); return }
  if (await persist([...copy(), { id: newLayerId(), title, sheets: [] }], t('layers.success.added', { title }))) newTitle.value = ''
}

const renameLayer = async (layer: CustomLayer) => {
  const title = titleOf(layer).trim()
  if (!title) { errorMessage.value = t('layers.error.titleRequired'); return }
  if (await persist(withLayer(layer.id, l => ({ ...l, title })), t('layers.success.renamed', { title }))) {
    const { [layer.id]: _, ...rest } = titleDrafts.value
    titleDrafts.value = rest
  }
}

const deleteLayer = async (layer: CustomLayer) => {
  if (!window.confirm(t('layers.deleteConfirm', { title: layer.title, n: layer.sheets.length }))) return
  await persist(copy().filter(l => l.id !== layer.id), t('layers.success.deleted', { title: layer.title }))
}

const removeSheet = async (layer: CustomLayer, sheet: MapSheet) => {
  if (!window.confirm(t('layers.sheet.removeConfirm', { title: sheet.title }))) return
  await persist(withLayer(layer.id, l => ({ ...l, sheets: l.sheets.filter(s => s.id !== sheet.id) })), t('layers.success.sheetRemoved', { title: sheet.title }))
}

// Largest residual of a placed sheet (metres), shown in the list
const sheetResidual = (sheet: MapSheet): number | null => {
  const fit = affineFromPoints(sheet.points)
  return fit ? Math.round(Math.max(...residuals(fit, sheet.points))) : null
}

// --- sheet dialog: upload or edit, title, source and control points ----------------------------------------
const editor = ref<{ points: () => MapSheet['points']; valid: () => boolean } | null>(null)
const dialog = ref<{ layerId: string; draft: MapSheet; imageUrl: string; isNew: boolean } | null>(null)
const uploadingFor = ref<string | null>(null)
// The error of the last upload, shown next to the layer's button (the page-wide message is far up)
const uploadError = ref<{ layerId: string; message: string } | null>(null)

const places = computed(() => (knownLocations.locations.value || [])
  .filter(location => location.latitude !== null && location.longitude !== null)
  .map(location => ({ name: location.name, lon: location.longitude!, lat: location.latitude! })))
// Points of the other sheets of the layer, so a new sheet opens the map where the layer already is
const focusPoints = computed<[number, number][]>(() => {
  if (!dialog.value) return []
  const layer = layers.value.find(l => l.id === dialog.value!.layerId)
  return (layer?.sheets || []).filter(s => s.id !== dialog.value!.draft.id).flatMap(s => s.points.map(p => [p.x, p.y] as [number, number]))
})

const startUpload = async (layer: CustomLayer, event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (layer.sheets.length >= MAX_SHEETS) { errorMessage.value = t('layers.error.tooManySheets', { n: MAX_SHEETS }); return }
  uploadingFor.value = layer.id
  errorMessage.value = ''
  uploadError.value = null
  try {
    const { file: path, width, height } = await mapLayers.uploadImage(file)
    const title = file.name.replace(/\.[^.]+$/, '').slice(0, MAX_TITLE) || layer.title
    dialog.value = {
      layerId: layer.id,
      draft: { id: newLayerId(), file: path, title, source: '', width, height, points: [] },
      imageUrl: await mapLayers.imageUrl(path),
      isNew: true,
    }
  } catch (error: any) {
    errorMessage.value = t('overlay.uploadFailed', { error: error?.data?.statusMessage || error?.message || '' })
    uploadError.value = { layerId: layer.id, message: errorMessage.value }
  } finally {
    uploadingFor.value = null
  }
}

const editSheet = async (layer: CustomLayer, sheet: MapSheet) => {
  errorMessage.value = ''
  try {
    dialog.value = { layerId: layer.id, draft: structuredClone(toRaw(sheet)), imageUrl: await mapLayers.imageUrl(sheet.file), isNew: false }
  } catch (error: any) {
    errorMessage.value = t('overlay.loadFailed', { error: error?.data?.statusMessage || error?.message || '' })
  }
}

const closeDialog = () => {
  if (dialog.value?.isNew && !window.confirm(t('layers.sheet.discardConfirm'))) return
  dialog.value = null
}

const dialogError = ref('')
const saveSheet = async () => {
  const current = dialog.value
  if (!current || !editor.value) return
  dialogError.value = ''
  const points = editor.value.points().map(p => ({ ...p }))
  if (points.length < MIN_POINTS) { dialogError.value = t('overlay.needThree'); return }
  if (!editor.value.valid()) { dialogError.value = t('overlay.collinear'); return }
  const title = current.draft.title.trim()
  if (!title) { dialogError.value = t('overlay.titleRequired'); return }
  const sheet: MapSheet = { ...current.draft, title, source: current.draft.source?.trim() || undefined, points }
  const next = withLayer(current.layerId, layer => ({
    ...layer,
    sheets: layer.sheets.some(s => s.id === sheet.id) ? layer.sheets.map(s => (s.id === sheet.id ? sheet : s)) : [...layer.sheets, sheet],
  }))
  if (await persist(next, t('layers.success.sheetSaved', { title }))) dialog.value = null
  else dialogError.value = errorMessage.value
}

const dialogLayerTitle = computed(() => layers.value.find(l => l.id === dialog.value?.layerId)?.title || '')
</script>

<template>
  <div class="min-h-screen">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300">{{ t('locations.admin') }}</p>
        <h1 class="mt-1 text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('layers.title') }}</h1>
        <p class="mt-2 max-w-3xl text-sm opacity-70">{{ t('layers.subtitle') }}</p>
      </div>
      <div class="flex gap-4 text-sm">
        <NuxtLink to="/map" class="underline">{{ t('layers.toMap') }}</NuxtLink>
        <NuxtLink to="/settings" class="underline">{{ t('locations.back') }}</NuxtLink>
      </div>
    </header>

    <section v-if="!adminAuth.isSystemAdmin.value" class="mb-6 rounded-lg border p-5" :class="cardClass">
      <AdminLogin />
    </section>

    <p v-if="errorMessage && !dialog" role="alert" class="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{{ errorMessage }}</p>
    <p v-if="successMessage" role="status" class="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">{{ successMessage }}</p>

    <template v-if="adminAuth.isSystemAdmin.value">
      <p v-if="!mapLayers.layers.value" class="opacity-70">{{ t('locations.loading') }}</p>
      <template v-else>
        <section class="mb-6 rounded-lg border p-5" :class="cardClass">
          <h2 class="mb-3 text-lg font-semibold">{{ t('layers.add.title') }}</h2>
          <form class="flex flex-wrap items-end gap-3" @submit.prevent="addLayer">
            <label class="min-w-[16rem] flex-1 text-sm">{{ t('layers.add.name') }}
              <input v-model="newTitle" required :maxlength="MAX_TITLE" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" :placeholder="t('layers.add.placeholder')" data-new-layer-title>
            </label>
            <button type="submit" :disabled="isSaving" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60" data-add-layer>{{ t('layers.add.button') }}</button>
          </form>
        </section>

        <p v-if="!layers.length" class="rounded-lg border p-8 text-center opacity-70" :class="cardClass">{{ t('layers.empty') }}</p>

        <section v-for="layer in layers" :key="layer.id" class="mb-4 rounded-lg border p-5" :class="cardClass" :data-layer="layer.id">
          <div class="flex flex-wrap items-end gap-3">
            <label class="min-w-[16rem] flex-1 text-sm">{{ t('layers.name') }}
              <input
                :value="titleOf(layer)"
                :maxlength="MAX_TITLE"
                class="mt-1 w-full rounded border px-3 py-2 text-base font-semibold bg-transparent"
                data-layer-title
                @input="titleDrafts = { ...titleDrafts, [layer.id]: ($event.target as HTMLInputElement).value }"
                @keydown.enter.prevent="renameLayer(layer)"
              >
            </label>
            <button type="button" class="rounded border px-3 py-2 text-sm disabled:opacity-50" :disabled="isSaving || titleOf(layer).trim() === layer.title" data-rename-layer @click="renameLayer(layer)">{{ t('layers.rename') }}</button>
            <button type="button" class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300" :disabled="isSaving" data-delete-layer @click="deleteLayer(layer)">{{ t('layers.delete') }}</button>
          </div>

          <h3 class="mt-4 mb-2 text-sm font-semibold">{{ t('layers.sheets', { n: layer.sheets.length }) }}</h3>
          <p v-if="!layer.sheets.length" class="text-sm text-amber-700 dark:text-amber-300">{{ t('layers.noSheets') }}</p>
          <ul v-else class="mb-2 divide-y divide-gray-100 text-sm dark:divide-gray-700">
            <li v-for="sheet in layer.sheets" :key="sheet.id" class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2" :data-sheet="sheet.id">
              <span class="font-medium">🗺 {{ sheet.title }}</span>
              <span v-if="sheet.source" class="opacity-60">{{ sheet.source }}</span>
              <span class="opacity-70">{{ t('overlay.points', { n: sheet.points.length }) }}<template v-if="sheetResidual(sheet) !== null"> · {{ t('overlay.maxResidual', { m: sheetResidual(sheet)! }) }}</template></span>
              <span class="ml-auto flex gap-3">
                <button type="button" class="underline" data-edit-sheet @click="editSheet(layer, sheet)">{{ t('overlay.edit') }}</button>
                <button type="button" class="text-red-700 underline dark:text-red-300" :disabled="isSaving" data-remove-sheet @click="removeSheet(layer, sheet)">{{ t('overlay.removeSheet') }}</button>
              </span>
            </li>
          </ul>
          <label class="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm" :class="{ 'opacity-50': uploadingFor === layer.id }">
            <input type="file" accept="image/jpeg,image/png,image/webp" class="hidden" :disabled="uploadingFor === layer.id" data-upload-sheet @change="startUpload(layer, $event)">
            {{ uploadingFor === layer.id ? t('overlay.uploading') : t('layers.addSheet') }}
          </label>
          <p v-if="uploadError?.layerId === layer.id" role="alert" class="mt-1 text-xs text-red-700 dark:text-red-300">{{ uploadError.message }}</p>
        </section>
      </template>
    </template>

    <!-- Sheet dialog: title, source and the control points placing the sheet onto the map -->
    <div v-if="dialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="closeDialog" @keydown.esc="closeDialog">
      <div class="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800 p-5 shadow-xl" role="dialog" aria-modal="true" data-sheet-dialog>
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-bold">{{ t('overlay.title') }} — {{ dialogLayerTitle }}</h2>
          <button type="button" class="text-2xl" :aria-label="t('tree.editor.close')" @click="closeDialog">&times;</button>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-3">
          <label class="text-sm">{{ t('overlay.sheetTitle') }}
            <input v-model="dialog.draft.title" required :maxlength="MAX_TITLE" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" :placeholder="t('overlay.sheetTitlePlaceholder')" data-sheet-title>
          </label>
          <label class="text-sm">{{ t('overlay.sourceLabel') }}
            <input v-model="dialog.draft.source" maxlength="500" class="mt-1 w-full rounded border px-3 py-2 bg-transparent" :placeholder="t('overlay.sourcePlaceholder')">
          </label>
        </div>
        <OverlayEditor
          ref="editor"
          :key="dialog.draft.id"
          :image-url="dialog.imageUrl"
          :width="dialog.draft.width"
          :height="dialog.draft.height"
          :initial-points="dialog.draft.points"
          :focus-points="focusPoints"
          :places="places"
        />
        <p v-if="dialogError" role="alert" class="mt-3 text-sm text-red-700 dark:text-red-300">{{ dialogError }}</p>
        <div class="mt-4 flex justify-end gap-3">
          <button type="button" class="px-4 py-2 rounded border" @click="closeDialog">{{ t('tree.cancel') }}</button>
          <button type="button" class="px-4 py-2 rounded bg-primary-600 text-white disabled:opacity-50" :disabled="isSaving" data-save-sheet @click="saveSheet">{{ isSaving ? t('locations.saving') : t('overlay.save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
