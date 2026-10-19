<script setup lang="ts">
// Admin → Users (role "admin"): create users, change their role and password, delete them. Databases are shared
// with users on My account (/account), where administrators manage every database.
import { useColorMode } from '#imports'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import { useSettings } from '~~/composables/useSettings'
import type { AccessLevel, UserInfo } from '~~/types/accounts'
import type { MessageKey } from '~~/i18n'
import { ACCESS_LEVELS, MIN_PASSWORD_LENGTH } from '~~/utils/accessLevels'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const cardClass = computed(() => (isDark.value ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'))
const { t } = useT()
const adminAuth = useAdminAuth()

const users = ref<UserInfo[]>([])
const loading = ref(false)
const busy = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const errorText = (error: any) => t('account.error', { error: error?.data?.statusMessage || error?.message || '' })
const levelLabel = (level: AccessLevel) => t(`auth.level.${level}` as MessageKey)
const { settings } = useSettings()
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB')

const load = async () => {
  if (!adminAuth.isSystemAdmin.value) return
  loading.value = true
  try {
    users.value = (await $fetch<{ users: UserInfo[] }>('/api/admin/users', { headers: adminAuth.authHeaders() })).users
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    loading.value = false
  }
}
onMounted(() => adminAuth.restore())
watch(() => adminAuth.isSystemAdmin.value, (isAdmin) => { if (isAdmin) void load() }, { immediate: true })

const run = async (action: () => Promise<string>) => {
  busy.value = true
  message.value = null
  try {
    message.value = { type: 'success', text: await action() }
    await load()
    // Own databases of a new or deleted user change the lists of the administrator too
    await adminAuth.refresh()
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    busy.value = false
  }
}

// New user
const newUser = ref({ username: '', password: '', role: 'read' as AccessLevel, withDatabase: false })
const createUser = () => run(async () => {
  if (newUser.value.password.length < MIN_PASSWORD_LENGTH) throw new Error(t('account.password.tooShort', { n: MIN_PASSWORD_LENGTH }))
  const { username, password, role, withDatabase } = newUser.value
  await $fetch('/api/admin/users', {
    method: 'POST',
    headers: adminAuth.authHeaders(),
    body: { username, password, role, databaseName: withDatabase ? t('users.create.databaseName', { name: username.trim() }) : '' },
  })
  newUser.value = { username: '', password: '', role: 'read', withDatabase: false }
  return t('users.created', { name: username.trim() })
})

const changeRole = (user: UserInfo, role: AccessLevel) => run(async () => {
  await $fetch(`/api/admin/users/${user.id}`, { method: 'PUT', headers: adminAuth.authHeaders(), body: { role } })
  return t('users.roleSaved', { name: user.username })
})

// One row at a time shows the password field
const passwordFor = ref<string | null>(null)
const passwordValue = ref('')
const setPassword = (user: UserInfo) => run(async () => {
  if (passwordValue.value.length < MIN_PASSWORD_LENGTH) throw new Error(t('account.password.tooShort', { n: MIN_PASSWORD_LENGTH }))
  await $fetch(`/api/admin/users/${user.id}`, { method: 'PUT', headers: adminAuth.authHeaders(), body: { password: passwordValue.value } })
  passwordFor.value = null
  passwordValue.value = ''
  return t('users.passwordSet', { name: user.username })
})

const deleteUser = (user: UserInfo) => {
  if (!window.confirm(t('users.deleteConfirm', { name: user.username }))) return
  void run(async () => {
    await $fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: adminAuth.authHeaders() })
    return t('users.deleted', { name: user.username })
  })
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('title.users') }}</h1>
        <p class="mt-1 text-sm opacity-70">{{ t('users.subtitle') }}</p>
      </div>
      <NuxtLink to="/account" class="text-sm underline">{{ t('users.manageDatabases') }}</NuxtLink>
    </header>

    <section v-if="!adminAuth.isSystemAdmin.value" class="mb-6 rounded-lg border p-5" :class="cardClass">
      <p v-if="adminAuth.isLoggedIn.value" class="mb-3 text-sm">{{ t('auth.adminRequired') }}</p>
      <AdminLogin />
    </section>

    <template v-else>
      <p v-if="message" :role="message.type === 'error' ? 'alert' : 'status'" class="mb-4 rounded border p-3 text-sm" :class="message.type === 'error'
        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        : 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'"
      >{{ message.text }}</p>

      <section class="mb-6 rounded-lg border p-5" :class="cardClass">
        <h2 class="mb-3 text-lg font-semibold">{{ t('users.create.title') }}</h2>
        <form class="grid gap-3 text-sm sm:grid-cols-[1fr_1fr_auto]" data-create-user @submit.prevent="createUser">
          <label class="flex flex-col gap-1">
            <span>{{ t('auth.username') }}</span>
            <input v-model="newUser.username" type="text" autocomplete="off" autocapitalize="none" class="rounded border bg-transparent px-3 py-1.5">
          </label>
          <label class="flex flex-col gap-1">
            <span>{{ t('auth.password') }}</span>
            <input v-model="newUser.password" type="password" autocomplete="new-password" class="rounded border bg-transparent px-3 py-1.5">
          </label>
          <label class="flex flex-col gap-1">
            <span>{{ t('users.role') }}</span>
            <select v-model="newUser.role" class="rounded border bg-transparent px-2 py-1.5">
              <option v-for="level in ACCESS_LEVELS" :key="level" :value="level" class="text-gray-900">{{ levelLabel(level) }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 sm:col-span-3">
            <input v-model="newUser.withDatabase" type="checkbox">
            <span>{{ t('users.create.database') }}</span>
          </label>
          <button type="submit" :disabled="busy || !newUser.username.trim() || !newUser.password" class="justify-self-start rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">
            {{ t('users.create.button') }}
          </button>
        </form>
      </section>

      <section class="rounded-lg border p-5" :class="cardClass">
        <p v-if="loading && !users.length" class="opacity-70">{{ t('locations.loading') }}</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-left dark:border-gray-700">
                <th class="py-2 pr-3">{{ t('auth.username') }}</th>
                <th class="py-2 pr-3">{{ t('users.role') }}</th>
                <th class="py-2 pr-3">{{ t('users.databases') }}</th>
                <th class="py-2 pr-3">{{ t('users.createdAt') }}</th>
                <th class="py-2" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id" class="border-b border-gray-100 align-top dark:border-gray-700/50" :data-user="user.username">
                <td class="py-2 pr-3 font-medium">
                  {{ user.username }}
                  <span v-if="user.id === adminAuth.user.value?.id" class="text-xs font-normal opacity-70">({{ t('users.you') }})</span>
                </td>
                <td class="py-2 pr-3">
                  <select :value="user.role" :disabled="busy" class="rounded border bg-transparent px-2 py-1" data-user-role @change="changeRole(user, ($event.target as HTMLSelectElement).value as AccessLevel)">
                    <option v-for="level in ACCESS_LEVELS" :key="level" :value="level" class="text-gray-900">{{ levelLabel(level) }}</option>
                  </select>
                </td>
                <td class="py-2 pr-3">{{ user.ownedDatabases }}</td>
                <td class="py-2 pr-3">{{ formatDate(user.createdAt) }}</td>
                <td class="py-2 text-right">
                  <form v-if="passwordFor === user.id" class="flex flex-wrap justify-end gap-2" @submit.prevent="setPassword(user)">
                    <input v-model="passwordValue" type="password" autocomplete="new-password" :placeholder="t('users.newPassword')" class="!w-40 rounded border bg-transparent px-2 py-1">
                    <button type="submit" :disabled="busy" class="rounded bg-primary-600 px-3 py-1 text-white">{{ t('users.setPassword') }}</button>
                    <button type="button" class="rounded border px-3 py-1" @click="passwordFor = null">{{ t('account.databases.close') }}</button>
                  </form>
                  <div v-else class="flex flex-wrap justify-end gap-3">
                    <button type="button" class="underline" @click="passwordFor = user.id; passwordValue = ''">{{ t('users.setPassword') }}</button>
                    <button v-if="user.id !== adminAuth.user.value?.id" type="button" :disabled="busy" class="text-red-600 underline" @click="deleteUser(user)">{{ t('users.delete') }}</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
