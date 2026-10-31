<script setup lang="ts">
// My account: the password, the databases (separate family trees) the user can open and the personal access keys
// for automated work (AccessTokens.vue). Whoever manages a database
// (its owner, an administrator) renames it, shares it with other users with a permission, and deletes it;
// administrators also change the owner and choose the public database. See server/utils/access.ts.
import { useColorMode } from '#imports'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import type { AccessLevel, DatabaseInfo } from '~~/types/accounts'
import type { MessageKey } from '~~/i18n'
import { ACCESS_LEVELS, levelAtLeast, MIN_PASSWORD_LENGTH } from '~~/utils/accessLevels'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const cardClass = computed(() => (isDark.value ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'))
const { t } = useT()
const adminAuth = useAdminAuth()
// Not useGedcomStore() (it would load the tree again); only whether there are unsaved edits
const gedcomState = useState<{ dirty?: boolean } | null>('gedcom-store')

const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const errorText = (error: any) => t('account.error', { error: error?.data?.statusMessage || error?.message || '' })
const levelLabel = (level: AccessLevel) => t(`auth.level.${level}` as MessageKey)
const isSystemToken = computed(() => adminAuth.user.value?.id === 'system')

onMounted(() => {
  adminAuth.restore()
  void adminAuth.refresh()
})

// Password
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changingPassword = ref(false)
const changePassword = async () => {
  message.value = null
  if (newPassword.value.length < MIN_PASSWORD_LENGTH) {
    message.value = { type: 'error', text: t('account.password.tooShort', { n: MIN_PASSWORD_LENGTH }) }
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    message.value = { type: 'error', text: t('account.password.mismatch') }
    return
  }
  changingPassword.value = true
  try {
    await adminAuth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = newPassword.value = confirmPassword.value = ''
    message.value = { type: 'success', text: t('account.password.changed') }
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    changingPassword.value = false
  }
}

// Users to share with (only those who can own a database may list them)
const canShare = computed(() => levelAtLeast(adminAuth.user.value?.role, 'edit'))
const directory = ref<{ id: string; username: string; role: AccessLevel }[]>([])
const loadDirectory = async () => {
  if (!canShare.value) return
  try {
    directory.value = (await $fetch<{ users: typeof directory.value }>('/api/users', { headers: adminAuth.authHeaders() })).users
  } catch (error) {
    console.error('[ACCOUNT] Users could not be loaded:', error)
  }
}
watch(canShare, (value) => { if (value) void loadDirectory() }, { immediate: true })
const usernameOf = (id: string | null) => directory.value.find(user => user.id === id)?.username || ''

const blockedByEdits = () => {
  if (!gedcomState.value?.dirty) return false
  message.value = { type: 'error', text: t('account.databases.dirty') }
  return true
}
const use = (db: DatabaseInfo) => {
  if (!blockedByEdits()) adminAuth.selectDatabase(db.id)
}

// New database
const newName = ref('')
const creating = ref(false)
const createDatabase = async () => {
  if (!newName.value.trim() || blockedByEdits()) return
  creating.value = true
  message.value = null
  try {
    const { database } = await $fetch<{ database: DatabaseInfo }>('/api/databases', { method: 'POST', headers: adminAuth.authHeaders(), body: { name: newName.value } })
    await adminAuth.refresh()
    adminAuth.selectDatabase(database.id)
    message.value = { type: 'success', text: t('account.databases.created', { name: database.name }) }
    newName.value = ''
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    creating.value = false
  }
}

// Managing one database: a draft of its name, owner, sharing and public flag, saved together
interface Draft { id: string; name: string; ownerId: string; isPublic: boolean; grants: { userId: string; level: AccessLevel }[]; addUserId: string; addLevel: AccessLevel }
const draft = ref<Draft | null>(null)
const saving = ref(false)
const openManage = (db: DatabaseInfo) => {
  draft.value = {
    id: db.id,
    name: db.name,
    ownerId: db.ownerId || '',
    isPublic: db.isPublic,
    grants: (db.grants || []).map(grant => ({ userId: grant.userId, level: grant.level })),
    addUserId: '',
    addLevel: 'read',
  }
}
const shareCandidates = computed(() => directory.value.filter(user => user.id !== draft.value?.ownerId && !draft.value?.grants.some(grant => grant.userId === user.id)))
const addGrant = () => {
  if (!draft.value?.addUserId) return
  draft.value.grants.push({ userId: draft.value.addUserId, level: draft.value.addLevel })
  draft.value.addUserId = ''
}
const removeGrant = (userId: string) => {
  if (draft.value) draft.value.grants = draft.value.grants.filter(grant => grant.userId !== userId)
}
const saveDraft = async () => {
  if (!draft.value) return
  const current = draft.value
  saving.value = true
  message.value = null
  try {
    const body: Record<string, unknown> = { name: current.name, grants: current.grants }
    if (adminAuth.isSystemAdmin.value) {
      body.isPublic = current.isPublic
      if (current.ownerId) body.ownerId = current.ownerId
    }
    const { database } = await $fetch<{ database: DatabaseInfo }>(`/api/databases/${current.id}`, { method: 'PUT', headers: adminAuth.authHeaders(), body })
    await adminAuth.refresh()
    draft.value = null
    message.value = { type: 'success', text: t('account.databases.saved', { name: database.name }) }
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    saving.value = false
  }
}
const deleteDatabase = async (db: DatabaseInfo) => {
  if (!window.confirm(t('account.databases.deleteConfirm', { name: db.name }))) return
  if (db.id === adminAuth.databaseId.value && blockedByEdits()) return
  saving.value = true
  message.value = null
  try {
    await $fetch(`/api/databases/${db.id}`, { method: 'DELETE', headers: adminAuth.authHeaders() })
    draft.value = null
    await adminAuth.refresh()
    message.value = { type: 'success', text: t('account.databases.deleted', { name: db.name }) }
  } catch (error) {
    message.value = { type: 'error', text: errorText(error) }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('title.account') }}</h1>
      <p class="mt-1 text-sm opacity-70">{{ t('account.subtitle') }}</p>
    </header>

    <section v-if="!adminAuth.isLoggedIn.value" class="mb-6 rounded-lg border p-5" :class="cardClass">
      <AdminLogin />
    </section>

    <template v-else>
      <p v-if="message" :role="message.type === 'error' ? 'alert' : 'status'" class="mb-4 rounded border p-3 text-sm" :class="message.type === 'error'
        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        : 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'"
      >{{ message.text }}</p>

      <section class="mb-6 rounded-lg border p-5" :class="cardClass" data-account-user>
        <dl class="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt class="opacity-70">{{ t('account.user') }}</dt>
          <dd class="font-medium">{{ adminAuth.user.value?.username }}</dd>
          <dt class="opacity-70">{{ t('account.role') }}</dt>
          <dd>{{ levelLabel(adminAuth.user.value!.role) }} <span class="opacity-70">– {{ t(`auth.levelHint.${adminAuth.user.value!.role}` as MessageKey) }}</span></dd>
        </dl>
        <p v-if="isSystemToken" class="text-sm opacity-80">{{ t('account.systemToken') }}</p>
        <form v-else class="grid gap-3 sm:grid-cols-3" data-change-password @submit.prevent="changePassword">
          <h2 class="text-lg font-semibold sm:col-span-3">{{ t('account.password.title') }}</h2>
          <!-- For password managers; the global input style would show it, hence display: none inline -->
          <input type="text" name="username" autocomplete="username" :value="adminAuth.user.value?.username" style="display: none" readonly>
          <label class="flex flex-col gap-1 text-sm">
            <span>{{ t('account.password.current') }}</span>
            <input v-model="currentPassword" type="password" autocomplete="current-password" class="rounded border bg-transparent px-3 py-1.5">
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>{{ t('account.password.new') }}</span>
            <input v-model="newPassword" type="password" autocomplete="new-password" class="rounded border bg-transparent px-3 py-1.5">
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span>{{ t('account.password.confirm') }}</span>
            <input v-model="confirmPassword" type="password" autocomplete="new-password" class="rounded border bg-transparent px-3 py-1.5">
          </label>
          <button type="submit" :disabled="changingPassword || !currentPassword || !newPassword" class="justify-self-start rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">
            {{ t('account.password.save') }}
          </button>
        </form>
      </section>

      <section class="mb-6 rounded-lg border p-5" :class="cardClass" data-databases>
        <h2 class="mb-1 text-lg font-semibold">{{ t('account.databases.title') }}</h2>
        <p class="mb-4 text-sm opacity-70">{{ t('account.databases.hint') }}</p>

        <p v-if="!adminAuth.databases.value.length" class="text-sm opacity-75">{{ t('account.databases.none') }}</p>
        <ul v-else class="divide-y divide-gray-200 dark:divide-gray-700">
          <li v-for="db in adminAuth.databases.value" :key="db.id" class="py-3" :data-database="db.id">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ db.name }}
                  <span v-if="db.isPublic" class="ml-2 rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" :title="t('account.databases.publicHint')">{{ t('account.databases.public') }}</span>
                  <span v-if="db.id === adminAuth.databaseId.value" class="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">{{ t('account.databases.current') }}</span>
                </p>
                <p class="text-xs opacity-70">
                  {{ t('account.databases.owner') }}: {{ db.ownerName || '–' }} · {{ t('account.databases.level') }}: {{ levelLabel(db.level) }}
                </p>
              </div>
              <button v-if="db.id !== adminAuth.databaseId.value" type="button" class="rounded border px-3 py-1 text-sm" @click="use(db)">{{ t('account.databases.use') }}</button>
              <button v-if="db.level === 'admin'" type="button" class="rounded border px-3 py-1 text-sm" data-manage-database @click="draft?.id === db.id ? draft = null : openManage(db)">
                {{ draft?.id === db.id ? t('account.databases.close') : t('account.databases.manage') }}
              </button>
            </div>

            <form v-if="draft?.id === db.id" class="mt-4 space-y-4 rounded border p-4 text-sm" :class="isDark ? 'border-gray-600' : 'border-gray-200'" @submit.prevent="saveDraft">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex flex-col gap-1">
                  <span>{{ t('account.databases.rename') }}</span>
                  <input v-model="draft.name" type="text" maxlength="100" class="rounded border bg-transparent px-3 py-1.5">
                </label>
                <label v-if="adminAuth.isSystemAdmin.value" class="flex flex-col gap-1">
                  <span>{{ t('account.databases.ownerChange') }}</span>
                  <select v-model="draft.ownerId" class="rounded border bg-transparent px-2 py-1.5">
                    <option v-if="!draft.ownerId" value="">–</option>
                    <option v-for="user in directory" :key="user.id" :value="user.id" class="text-gray-900">{{ user.username }}</option>
                  </select>
                </label>
              </div>
              <label v-if="adminAuth.isSystemAdmin.value" class="flex items-center gap-2">
                <input v-model="draft.isPublic" type="checkbox">
                <span>{{ t('account.databases.makePublic') }}</span>
              </label>

              <div>
                <p class="mb-1 font-medium">{{ t('account.databases.sharing') }}</p>
                <p class="mb-2 text-xs opacity-70">{{ t('account.databases.sharingHint') }}</p>
                <p v-if="!draft.grants.length" class="mb-2 opacity-70">{{ t('account.databases.sharingNone') }}</p>
                <ul v-else class="mb-2 space-y-2">
                  <li v-for="grant in draft.grants" :key="grant.userId" class="flex flex-wrap items-center gap-2" :data-grant="usernameOf(grant.userId)">
                    <span class="min-w-[8rem] font-medium">{{ usernameOf(grant.userId) || db.grants?.find(entry => entry.userId === grant.userId)?.username }}</span>
                    <select v-model="grant.level" class="rounded border bg-transparent px-2 py-1">
                      <option v-for="level in ACCESS_LEVELS" :key="level" :value="level" class="text-gray-900">{{ levelLabel(level) }}</option>
                    </select>
                    <button type="button" class="text-red-600 underline" @click="removeGrant(grant.userId)">{{ t('account.databases.remove') }}</button>
                  </li>
                </ul>
                <div v-if="shareCandidates.length" class="flex flex-wrap items-center gap-2">
                  <select v-model="draft.addUserId" class="rounded border bg-transparent px-2 py-1" data-share-user>
                    <option value="">{{ t('account.databases.chooseUser') }}</option>
                    <option v-for="user in shareCandidates" :key="user.id" :value="user.id" class="text-gray-900">{{ user.username }} ({{ levelLabel(user.role) }})</option>
                  </select>
                  <select v-model="draft.addLevel" class="rounded border bg-transparent px-2 py-1" data-share-level>
                    <option v-for="level in ACCESS_LEVELS" :key="level" :value="level" class="text-gray-900">{{ levelLabel(level) }}</option>
                  </select>
                  <button type="button" :disabled="!draft.addUserId" class="rounded border px-3 py-1 disabled:opacity-50" data-share-add @click="addGrant">{{ t('account.databases.addUser') }}</button>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <button type="submit" :disabled="saving || !draft.name.trim()" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60" data-save-database>{{ t('account.databases.save') }}</button>
                <button type="button" :disabled="saving" class="rounded border border-red-300 px-4 py-2 text-red-700 dark:border-red-700 dark:text-red-300" @click="deleteDatabase(db)">{{ t('account.databases.delete') }}</button>
              </div>
            </form>
          </li>
        </ul>

        <form v-if="canShare" class="mt-4 flex flex-wrap items-end gap-3 border-t pt-4" :class="isDark ? 'border-gray-700' : 'border-gray-200'" data-create-database @submit.prevent="createDatabase">
          <label class="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
            <span class="font-medium">{{ t('account.databases.create') }}</span>
            <input v-model="newName" type="text" maxlength="100" :placeholder="t('account.databases.createPlaceholder')" class="rounded border bg-transparent px-3 py-1.5">
          </label>
          <button type="submit" :disabled="creating || !newName.trim()" class="rounded bg-primary-600 px-4 py-2 font-medium text-white disabled:opacity-60">{{ t('account.databases.createButton') }}</button>
        </form>
      </section>

      <AccessTokens v-if="!isSystemToken" class="mb-6 rounded-lg border p-5" :class="cardClass" />

      <section class="rounded-lg border p-5 text-sm" :class="cardClass">
        <h2 class="mb-2 text-lg font-semibold">{{ t('users.roles') }}</h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <template v-for="level in ACCESS_LEVELS" :key="level">
            <dt class="font-medium">{{ levelLabel(level) }}</dt>
            <dd class="opacity-80">{{ t(`auth.levelHint.${level}` as MessageKey) }}</dd>
          </template>
        </dl>
      </section>
    </template>
  </div>
</template>
