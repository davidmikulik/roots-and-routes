<script setup lang="ts">
// History of the tree (docs/zdroje-a-bezpecne-ukladani-zadani.md, 4.6 and 5.3): every saved change (edits in the app,
// approved batches, imports, restores) with who and when, the overview of the changed records (before / after), and
// "Revert" for changes that can be reverted (not imports and restores, nothing that was changed again later). For
// those who may edit the database. ?revision=<n> opens an entry.
import { useColorMode } from '#imports'
import type { ChangePreviewItem } from '~~/utils/gedcom/changes'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

interface Summary {
  revision: number
  at: string
  actor: { username: string; token?: string }
  title: string
  kind: string
  counts: { added: number; changed: number; removed: number }
  revertible: boolean
  revertOf?: number
  revertedBy?: number
  proposedBy?: { username: string; token?: string }
}
interface Detail { entry: Summary; revision: number; preview: ChangePreviewItem[]; canRevert: boolean; blocked: string[] }

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

const entries = ref<Summary[]>([])
const total = ref(0)
const loading = ref(false)
const message = ref<{ type: 'ok' | 'error'; text: string } | null>(null)
const load = async () => {
  if (!adminAuth.canEdit.value) return
  loading.value = true
  try {
    const response = await $fetch<{ entries: Summary[]; total: number }>('/api/gedcom/history', { headers: headers(), query: { limit: 300 } })
    entries.value = response.entries
    total.value = response.total
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => adminAuth.dataKey.value, load)

const selected = computed(() => Number(route.query.revision) || 0)
const detail = ref<Detail | null>(null)
const loadDetail = async () => {
  detail.value = null
  if (!selected.value || !adminAuth.canEdit.value) return
  try {
    detail.value = await $fetch<Detail>(`/api/gedcom/history/${selected.value}`, { headers: headers(), query: { lang: lang.value } })
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  }
}
watch([selected, () => adminAuth.dataKey.value], loadDetail, { immediate: true })

const busy = ref(false)
const revert = async () => {
  if (!detail.value || !window.confirm(t('history.revertConfirm', { title: detail.value.entry.title }))) return
  if (gedcomStore.state.value.dirty) { message.value = { type: 'error', text: t('changes.dirty') }; return }
  busy.value = true
  try {
    const response = await $fetch<{ revision: number }>(`/api/gedcom/history/${detail.value.entry.revision}/revert`, { method: 'POST', headers: headers(), body: { baseRevision: detail.value.revision } })
    message.value = { type: 'ok', text: t('history.reverted', { revision: response.revision }) }
    await gedcomStore.refreshFromServer()
    await load()
    await router.replace({ query: { revision: String(response.revision) } })
  } catch (error) {
    message.value = { type: 'error', text: t('history.revertFailed', { error: errorText(error) }) }
    await loadDetail()
  } finally {
    busy.value = false
  }
}

const who = (by: { username: string; token?: string }) => (by.token ? `${by.username} (${t('changes.viaKey', { name: by.token })})` : by.username)
const counts = (entry: Summary) => [
  entry.counts.added ? t('history.added', { n: entry.counts.added }) : '',
  entry.counts.changed ? t('history.changed', { n: entry.counts.changed }) : '',
  entry.counts.removed ? t('history.removed', { n: entry.counts.removed }) : '',
].filter(Boolean).join(', ')
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('title.history') }}</h1>
      <p class="mt-1 text-sm opacity-70">{{ t('history.subtitle') }}</p>
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
        <section class="rounded-lg border p-4" :class="cardClass" data-history-list>
          <div class="mb-2 flex items-center justify-between">
            <h2 class="font-semibold">{{ t('history.list', { n: total }) }}</h2>
            <button type="button" class="rounded border px-2 py-0.5 text-xs" :disabled="loading" @click="load">{{ t('changes.reload') }}</button>
          </div>
          <p v-if="loading" class="text-sm opacity-70">{{ t('graph.loading') }}</p>
          <p v-else-if="!entries.length" class="text-sm opacity-70">{{ t('history.empty') }}</p>
          <ul class="max-h-[75vh] divide-y overflow-y-auto text-sm dark:divide-gray-700">
            <li v-for="entry in entries" :key="entry.revision">
              <NuxtLink :to="{ query: { revision: String(entry.revision) } }" class="block px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" :class="entry.revision === selected ? 'bg-primary-50 dark:bg-primary-900/30' : ''" :data-history-entry="entry.revision">
                <span class="block font-medium" :class="entry.revertedBy ? 'line-through opacity-60' : ''">{{ entry.title }}</span>
                <span class="block text-xs opacity-70">
                  #{{ entry.revision }} · {{ formatTime(entry.at) }} · {{ who(entry.actor) }} · {{ t(`history.kind.${entry.kind}` as MessageKey) }}<template v-if="counts(entry)"> · {{ counts(entry) }}</template>
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <section class="rounded-lg border p-4" :class="cardClass" data-history-detail>
          <template v-if="detail">
            <h2 class="text-lg font-semibold">{{ detail.entry.title }}</h2>
            <p class="mb-3 text-xs opacity-70">
              #{{ detail.entry.revision }} · {{ formatTime(detail.entry.at) }} · {{ who(detail.entry.actor) }}
              <template v-if="detail.entry.proposedBy"> · {{ t('history.proposedBy', { name: who(detail.entry.proposedBy) }) }}</template>
            </p>
            <p v-if="detail.entry.revertOf" class="mb-2 text-sm"><NuxtLink :to="{ query: { revision: String(detail.entry.revertOf) } }" class="text-primary-700 underline dark:text-primary-300">{{ t('history.revertOf', { revision: detail.entry.revertOf }) }}</NuxtLink></p>
            <p v-if="detail.entry.revertedBy" class="mb-2 text-sm"><NuxtLink :to="{ query: { revision: String(detail.entry.revertedBy) } }" class="text-primary-700 underline dark:text-primary-300">{{ t('history.revertedBy', { revision: detail.entry.revertedBy }) }}</NuxtLink></p>
            <p v-if="!detail.entry.revertible" class="mb-2 text-sm opacity-80">{{ t('history.notRevertible') }}</p>
            <p v-else-if="detail.blocked.length" class="mb-2 text-sm text-amber-800 dark:text-amber-300">{{ t('history.blocked', { n: detail.blocked.length }) }}</p>
            <button v-if="detail.canRevert" type="button" class="mb-3 rounded border border-red-400 px-4 py-1.5 text-red-700 disabled:opacity-50 dark:text-red-300" :disabled="busy" data-history-revert @click="revert">{{ t('history.revert') }}</button>
            <ChangePreview :items="detail.preview" :was-label="t('history.before')" :will-label="t('history.after')" />
          </template>
          <p v-else class="text-sm opacity-70">{{ t('history.choose') }}</p>
        </section>
      </div>
    </template>
  </div>
</template>
