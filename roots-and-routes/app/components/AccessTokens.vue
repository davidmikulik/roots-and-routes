<script setup lang="ts">
// My account → Access keys (docs/zdroje-a-bezpecne-ukladani-zadani.md, 5.4): personal keys for scripts and other
// automated work. A key works for one database: "proposer" reads and sends batches of changes that wait for approval
// (page Pending changes), "editor" also saves them right away. The key is shown once, only its hash is stored. The
// list shows the last use; Revoke stops the key at once. Server: /api/auth/tokens.
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import { levelAtLeast } from '~~/utils/accessLevels'
import type { MessageKey } from '~~/i18n'

interface TokenInfo { id: string; name: string; kind: 'proposer' | 'editor'; databaseId: string; databaseName: string; createdAt: string; expiresAt?: string; lastUsedAt?: string }

const { t } = useT()
const { settings } = useSettings()
const adminAuth = useAdminAuth()
const tokens = ref<TokenInfo[]>([])
const message = ref<{ type: 'ok' | 'error'; text: string } | null>(null)
const created = ref('')
const copied = ref(false)
const busy = ref(false)
const form = reactive({ name: '', kind: 'proposer' as 'proposer' | 'editor', databaseId: '', expiresInDays: '90' })

const headers = (): Record<string, string> => (adminAuth.token.value ? { Authorization: `Bearer ${adminAuth.token.value}` } : {})
const errorText = (error: any) => error?.data?.statusMessage || error?.message || t('tree.unknownError')
const formatTime = (value?: string) => (value ? new Date(value).toLocaleString(settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB') : '—')
// Databases a key can be made for: read for a proposer, edit for an editor
const databases = computed(() => adminAuth.databases.value.filter(db => levelAtLeast(db.level, form.kind === 'editor' ? 'edit' : 'read')))
watch(databases, (list) => {
  if (!list.some(db => db.id === form.databaseId)) form.databaseId = list.find(db => db.id === adminAuth.databaseId.value)?.id || list[0]?.id || ''
}, { immediate: true })

const load = async () => {
  if (!adminAuth.isLoggedIn.value) return
  try {
    tokens.value = (await $fetch<{ tokens: TokenInfo[] }>('/api/auth/tokens', { headers: headers() })).tokens
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  }
}
onMounted(load)

const create = async () => {
  if (!form.name.trim() || !form.databaseId) return
  busy.value = true
  message.value = null
  try {
    const response = await $fetch<{ token: string; info: TokenInfo }>('/api/auth/tokens', {
      method: 'POST',
      headers: headers(),
      body: { name: form.name.trim(), kind: form.kind, databaseId: form.databaseId, expiresInDays: Number(form.expiresInDays) || undefined },
    })
    created.value = response.token
    copied.value = false
    form.name = ''
    await load()
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    busy.value = false
  }
}

const copy = async () => {
  try {
    await navigator.clipboard.writeText(created.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}

const revoke = async (token: TokenInfo) => {
  if (!window.confirm(t('tokens.revokeConfirm', { name: token.name }))) return
  try {
    await $fetch(`/api/auth/tokens/${token.id}`, { method: 'DELETE', headers: headers() })
    message.value = { type: 'ok', text: t('tokens.revoked', { name: token.name }) }
    await load()
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  }
}
const inputClass = 'rounded border bg-transparent px-3 py-1.5'
</script>

<template>
  <section data-access-tokens>
    <h2 class="mb-1 text-lg font-semibold">{{ t('tokens.title') }}</h2>
    <p class="mb-3 text-sm opacity-80">{{ t('tokens.hint') }}</p>
    <p v-if="message" :role="message.type === 'error' ? 'alert' : 'status'" class="mb-3 text-sm" :class="message.type === 'error' ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-400'">{{ message.text }}</p>

    <div v-if="created" class="mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-token-created>
      <p class="mb-1 font-semibold">{{ t('tokens.createdOnce') }}</p>
      <code class="block break-all rounded bg-white/70 p-2 font-mono text-xs dark:bg-black/30" data-token-value>{{ created }}</code>
      <div class="mt-2 flex gap-2">
        <button type="button" class="rounded border px-3 py-1" @click="copy">{{ copied ? t('tokens.copied') : t('tokens.copy') }}</button>
        <button type="button" class="rounded border px-3 py-1" @click="created = ''">{{ t('tokens.hide') }}</button>
      </div>
    </div>

    <form class="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4" data-token-form @submit.prevent="create">
      <label class="flex flex-col gap-1">
        <span class="font-medium">{{ t('tokens.name') }}</span>
        <input v-model="form.name" type="text" maxlength="80" :class="inputClass" :placeholder="t('tokens.namePlaceholder')" data-token-name>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-medium">{{ t('tokens.kind') }}</span>
        <select v-model="form.kind" :class="inputClass" data-token-kind>
          <option value="proposer" class="text-gray-900">{{ t('tokens.kind.proposer') }}</option>
          <option value="editor" class="text-gray-900">{{ t('tokens.kind.editor') }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-medium">{{ t('auth.database') }}</span>
        <select v-model="form.databaseId" :class="inputClass" data-token-database>
          <option v-for="db in databases" :key="db.id" :value="db.id" class="text-gray-900">{{ db.name }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="font-medium">{{ t('tokens.expires') }}</span>
        <select v-model="form.expiresInDays" :class="inputClass">
          <option v-for="days in ['30', '90', '365', '']" :key="days" :value="days" class="text-gray-900">{{ days ? t('tokens.days', { n: days }) : t('tokens.never') }}</option>
        </select>
      </label>
      <p class="text-xs opacity-70 sm:col-span-2 lg:col-span-4">{{ t(`tokens.kindHint.${form.kind}` as MessageKey) }}</p>
      <div class="sm:col-span-2 lg:col-span-4">
        <button type="submit" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60" :disabled="busy || !form.name.trim() || !form.databaseId" data-token-create>{{ t('tokens.create') }}</button>
      </div>
    </form>

    <p v-if="!tokens.length" class="text-sm opacity-70">{{ t('tokens.none') }}</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs opacity-70">
            <th class="pr-3 font-normal">{{ t('tokens.name') }}</th>
            <th class="pr-3 font-normal">{{ t('tokens.kind') }}</th>
            <th class="pr-3 font-normal">{{ t('auth.database') }}</th>
            <th class="pr-3 font-normal">{{ t('tokens.lastUsed') }}</th>
            <th class="pr-3 font-normal">{{ t('tokens.expires') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in tokens" :key="token.id" class="border-t dark:border-gray-700" :data-token="token.id">
            <td class="py-1.5 pr-3 font-medium">{{ token.name }}</td>
            <td class="pr-3">{{ t(`tokens.kind.${token.kind}` as MessageKey) }}</td>
            <td class="pr-3">{{ token.databaseName }}</td>
            <td class="pr-3">{{ formatTime(token.lastUsedAt) }}</td>
            <td class="pr-3">{{ token.expiresAt ? formatTime(token.expiresAt) : t('tokens.never') }}</td>
            <td class="text-right"><button type="button" class="rounded border border-red-400 px-2 py-0.5 text-red-700 dark:text-red-300" :data-token-revoke="token.id" @click="revoke(token)">{{ t('tokens.revoke') }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
