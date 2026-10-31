<script setup lang="ts">
// Pending changes (docs/zdroje-a-bezpecne-ukladani-zadani.md, 4.5): batches sent with a proposer's access key wait
// here. Each shows who sent it and when, its operations (all or some can be chosen) and the overview of the changes
// against the tree as it is now (was / will be). Approve all, approve the chosen ones (the others are dropped), or
// reject. Overwriting a value must be confirmed. For those who may edit the database.
import { useColorMode } from '#imports'
import type { ChangePreviewItem, OverwriteConflict } from '~~/utils/gedcom/changes'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import { messages, type MessageKey } from '~~/i18n'

interface BatchSummary { id: string; title: string; createdAt: string; createdBy: { username: string; token?: string }; operations: number }
interface BatchDetail {
  batch: { id: string; title: string; createdAt: string; createdBy: { username: string; token?: string }; operations: string[] }
  revision: number
  overwrites: OverwriteConflict[]
  preview: ChangePreviewItem[]
  errors: string[]
}

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const cardClass = computed(() => (isDark.value ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'))
const { t } = useT()
const { settings } = useSettings()
const adminAuth = useAdminAuth()
const gedcomStore = useGedcomStore()
const route = useRoute()
const router = useRouter()

const headers = () => adminAuth.authHeaders(gedcomStore.state.value.databaseId)
const lang = computed(() => settings.value.language)
const formatTime = (value: string) => new Date(value).toLocaleString(lang.value === 'cs' ? 'cs-CZ' : 'en-GB')
const errorText = (error: any): string => error?.data?.message || error?.data?.statusMessage || error?.message || t('tree.unknownError')

const batches = ref<BatchSummary[]>([])
const loading = ref(false)
const message = ref<{ type: 'ok' | 'error'; text: string } | null>(null)

const load = async () => {
  if (!adminAuth.canEdit.value) return
  loading.value = true
  try {
    batches.value = (await $fetch<{ batches: BatchSummary[] }>('/api/gedcom/pending', { headers: headers() })).batches
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => adminAuth.dataKey.value, load)

const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const detail = ref<BatchDetail | null>(null)
const chosen = ref<number[]>([])
const confirmOverwrite = ref(false)
const busy = ref(false)

const loadDetail = async (ops?: number[]) => {
  if (!selectedId.value) { detail.value = null; return }
  try {
    detail.value = await $fetch<BatchDetail>(`/api/gedcom/pending/${selectedId.value}`, { headers: headers(), query: { lang: lang.value, ...(ops && ops.length < (detail.value?.batch.operations.length || 0) ? { ops: ops.join(',') } : {}) } })
    if (!ops) chosen.value = detail.value.batch.operations.map((_, index) => index)
    confirmOverwrite.value = false
  } catch (error) {
    detail.value = null
    message.value = { type: 'error', text: errorText(error) }
  }
}
watch(selectedId, () => loadDetail(), { immediate: true })
const toggle = (index: number) => {
  chosen.value = chosen.value.includes(index) ? chosen.value.filter(item => item !== index) : [...chosen.value, index].sort((a, b) => a - b)
  if (chosen.value.length) void loadDetail(chosen.value)
}
const allChosen = computed(() => !!detail.value && chosen.value.length === detail.value.batch.operations.length)

const afterChange = async (text: string) => {
  message.value = { type: 'ok', text }
  await router.replace({ query: { ...route.query, id: undefined } })
  await load()
  // The tree changed on the server: load it again (unsaved edits block approving, see below)
  if (!gedcomStore.state.value.dirty) await gedcomStore.refreshFromServer()
}

const approve = async () => {
  if (!detail.value || !chosen.value.length) return
  if (gedcomStore.state.value.dirty) { message.value = { type: 'error', text: t('changes.dirty') }; return }
  if (detail.value.overwrites.length && !confirmOverwrite.value) { message.value = { type: 'error', text: t('changes.confirmNeeded') }; return }
  busy.value = true
  try {
    await $fetch(`/api/gedcom/pending/${selectedId.value}`, {
      method: 'POST',
      headers: headers(),
      body: { action: 'approve', baseRevision: detail.value.revision, ops: allChosen.value ? undefined : chosen.value, confirmOverwrite: confirmOverwrite.value },
    })
    await afterChange(t('changes.approved'))
  } catch (error) {
    message.value = { type: 'error', text: t('changes.failed', { error: errorText(error) }) }
    await loadDetail(chosen.value)
  } finally {
    busy.value = false
  }
}

const reject = async () => {
  if (!detail.value || !window.confirm(t('changes.rejectConfirm', { title: detail.value.batch.title }))) return
  busy.value = true
  try {
    await $fetch(`/api/gedcom/pending/${selectedId.value}`, { method: 'POST', headers: headers(), body: { action: 'reject' } })
    await afterChange(t('changes.rejected'))
  } catch (error) {
    message.value = { type: 'error', text: t('changes.failed', { error: errorText(error) }) }
  } finally {
    busy.value = false
  }
}
// "DEAT.date" → "Úmrtí (datum)"
const overwriteField = (field: string): string => {
  const [fact, part] = field.split('.') as [string, string | undefined]
  const factKey = [`changes.field.${fact}`, `tree.event.${fact}`].find(key => key in messages.en)
  const partKey = `changes.part.${part}`
  return `${factKey ? t(factKey as MessageKey) : fact}${part ? ` (${partKey in messages.en ? t(partKey as MessageKey) : part})` : ''}`
}
const who = (by: { username: string; token?: string }) => (by.token ? `${by.username} (${t('changes.viaKey', { name: by.token })})` : by.username)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('title.changes') }}</h1>
      <p class="mt-1 text-sm opacity-70">{{ t('changes.subtitle') }}</p>
    </header>

    <section v-if="!adminAuth.canEdit.value" class="rounded-lg border p-5" :class="cardClass">
      <p class="text-sm">{{ t('admin.required') }}</p>
    </section>
    <template v-else>
      <p v-if="message" :role="message.type === 'error' ? 'alert' : 'status'" class="mb-4 rounded border p-3 text-sm" :class="message.type === 'error'
        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        : 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'"
      >{{ message.text }}</p>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section class="rounded-lg border p-4" :class="cardClass" data-pending-list>
          <div class="mb-2 flex items-center justify-between">
            <h2 class="font-semibold">{{ t('changes.list') }}</h2>
            <button type="button" class="rounded border px-2 py-0.5 text-xs" :disabled="loading" @click="load">{{ t('changes.reload') }}</button>
          </div>
          <p v-if="loading" class="text-sm opacity-70">{{ t('graph.loading') }}</p>
          <p v-else-if="!batches.length" class="text-sm opacity-70" data-pending-empty>{{ t('changes.empty') }}</p>
          <ul class="divide-y text-sm dark:divide-gray-700">
            <li v-for="batch in batches" :key="batch.id">
              <NuxtLink :to="{ query: { id: batch.id } }" class="block px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" :class="batch.id === selectedId ? 'bg-primary-50 dark:bg-primary-900/30' : ''" :data-pending-batch="batch.id">
                <span class="block font-medium">{{ batch.title }}</span>
                <span class="block text-xs opacity-70">{{ who(batch.createdBy) }} · {{ formatTime(batch.createdAt) }} · {{ t('changes.operationsCount', { n: batch.operations }) }}</span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section class="rounded-lg border p-4" :class="cardClass" data-pending-detail>
          <template v-if="detail">
            <h2 class="text-lg font-semibold">{{ detail.batch.title }}</h2>
            <p class="mb-3 text-xs opacity-70">{{ who(detail.batch.createdBy) }} · {{ formatTime(detail.batch.createdAt) }}</p>

            <div v-if="detail.errors.length" role="alert" class="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p class="font-semibold">{{ t('changes.cannotApply') }}</p>
              <ul class="list-disc pl-5"><li v-for="(error, index) in detail.errors" :key="index">{{ error }}</li></ul>
            </div>

            <h3 class="mb-1 text-sm font-semibold">{{ t('changes.operations') }}</h3>
            <ul class="mb-3 space-y-1 text-sm">
              <li v-for="(operation, index) in detail.batch.operations" :key="index">
                <label class="flex items-start gap-2">
                  <input type="checkbox" class="mt-1" :checked="chosen.includes(index)" :data-pending-op="index" @change="toggle(index)">
                  <span class="break-words">{{ index + 1 }}. {{ operation }}</span>
                </label>
              </li>
            </ul>

            <div v-if="detail.overwrites.length" class="mb-3 rounded border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-pending-overwrites>
              <p class="font-semibold">{{ t('changes.overwrites') }}</p>
              <ul class="mb-2 list-disc pl-5">
                <li v-for="(item, index) in detail.overwrites" :key="index">{{ item.target }} – {{ overwriteField(item.field) }}: <s>{{ item.before }}</s> → <strong>{{ item.after }}</strong></li>
              </ul>
              <label class="flex items-center gap-2"><input v-model="confirmOverwrite" type="checkbox" data-confirm-overwrite> {{ t('changes.confirmOverwrite') }}</label>
            </div>

            <h3 class="mb-1 text-sm font-semibold">{{ t('changes.preview') }}</h3>
            <ChangePreview :items="detail.preview" class="mb-4" />

            <div class="flex flex-wrap gap-2">
              <button type="button" class="rounded bg-primary-600 px-4 py-1.5 text-white disabled:opacity-50" :disabled="busy || !chosen.length || !!detail.errors.length" data-pending-approve @click="approve">
                {{ allChosen ? t('changes.approveAll') : t('changes.approveChosen', { n: chosen.length }) }}
              </button>
              <button type="button" class="rounded border border-red-400 px-4 py-1.5 text-red-700 disabled:opacity-50 dark:text-red-300" :disabled="busy" data-pending-reject @click="reject">{{ t('changes.reject') }}</button>
            </div>
            <p v-if="!allChosen" class="mt-2 text-xs opacity-70">{{ t('changes.chosenHint') }}</p>
          </template>
          <p v-else class="text-sm opacity-70">{{ t('changes.choose') }}</p>
        </section>
      </div>
    </template>
  </div>
</template>
