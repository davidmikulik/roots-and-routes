<script setup lang="ts">
import { useReleaseNotes } from '~~/composables/useReleaseNotes'
import { useColorMode } from '#imports'
import { useGedcomStore } from '~~/composables/useGedcomStore'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings, LANGUAGES } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'
import { useAnonymize } from '~~/composables/useAnonymize'

interface BackupInfo { id: string; createdAt: string; size: number; attachments?: number }

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const { t } = useT()
const appSettings = useSettings()
const settings = appSettings.settings
const adminAuth = useAdminAuth()
const gedcomStore = useGedcomStore()
const anon = useAnonymize()

const activeSection = ref('general')
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const sections = [
  { id: 'general', icon: '⚙️' },
  { id: 'map', icon: '🗺️' },
  { id: 'tree', icon: '🌳' },
  { id: 'data', icon: '💾' },
  { id: 'privacy', icon: '🔒' },
  { id: 'about', icon: 'ℹ️' },
] as const

// /settings?section=data (the administrator's menu links to the backups)
const settingsRoute = useRoute()
watch(() => settingsRoute.query.section, (section) => {
  if (typeof section === 'string' && sections.some(item => item.id === section)) activeSection.value = section
}, { immediate: true })

const themeOptions = [
  { value: 'light', icon: '☀️' },
  { value: 'dark', icon: '🌙' },
  { value: 'system', icon: '🖥️' },
] as const

const treeViews = ['tree', 'chart', 'list'] as const

// The preference (not the resolved value) is what the color-mode module remembers
const setTheme = (theme: 'light' | 'dark' | 'system') => {
  colorMode.preference = theme
}

const resetToDefaults = () => {
  if (!window.confirm(t('settings.resetConfirm'))) return
  appSettings.reset()
  message.value = { type: 'success', text: t('settings.resetDone') }
}

const exportSettings = () => {
  const blob = new Blob([JSON.stringify(settings.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'roots-and-routes-settings.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const importSettings = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('not an object')
    appSettings.replace(data)
    message.value = { type: 'success', text: t('settings.importDone') }
  } catch {
    message.value = { type: 'error', text: t('settings.importInvalid') }
  } finally {
    // Allows importing the same file again
    input.value = ''
  }
}

// Backups of the chosen database live on the server: those who edit it see and make them, restoring needs the
// permission to administer it
const backups = ref<BackupInfo[]>([])
const backupsLoading = ref(false)

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB')
const formatSize = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} kB`

const loadBackups = async () => {
  if (!adminAuth.canEdit.value) {
    backups.value = []
    return
  }
  backupsLoading.value = true
  try {
    backups.value = (await $fetch<{ backups: BackupInfo[] }>('/api/admin/backups', { headers: adminAuth.authHeaders() })).backups
  } catch {
    message.value = { type: 'error', text: t('settings.data.loadFailed') }
  } finally {
    backupsLoading.value = false
  }
}

const restoreBackup = async (backup: BackupInfo) => {
  if (!window.confirm(t('settings.data.restoreConfirm', { date: formatDate(backup.createdAt) }))) return
  try {
    const result = await $fetch<{ people: number }>('/api/admin/backups/restore', {
      method: 'POST',
      headers: adminAuth.authHeaders(),
      body: { id: backup.id, keep: settings.value.data.backupCount },
    })
    await gedcomStore.refreshFromServer()
    await loadBackups()
    message.value = { type: 'success', text: t('settings.data.restored', { people: result.people }) }
  } catch {
    message.value = { type: 'error', text: t('settings.data.restoreFailed') }
  }
}

// One-off: names after marriage from the original GEDCOM file (utils/gedcom/marriedNames.ts). First only counted,
// then after a confirmation taken over; the server backs the tree up first. Not with unsaved edits in the browser:
// the next save would overwrite the server's tree with the older copy.
const marriedNamesBusy = ref(false)
const takeMarriedNames = async () => {
  if (gedcomStore.state.value.dirty) {
    message.value = { type: 'error', text: t('settings.data.marriedNames.dirty') }
    return
  }
  marriedNamesBusy.value = true
  message.value = null
  try {
    type Result = { added: number; mismatched: number; alreadySet: number }
    const check = await $fetch<Result>('/api/admin/married-names', { method: 'POST', headers: adminAuth.authHeaders(), body: { apply: false } })
    if (!check.added) {
      message.value = { type: 'success', text: t('settings.data.marriedNames.none', { skipped: check.mismatched, already: check.alreadySet }) }
      return
    }
    if (!window.confirm(t('settings.data.marriedNames.confirm', { n: check.added, skipped: check.mismatched }))) return
    const result = await $fetch<Result>('/api/admin/married-names', {
      method: 'POST',
      headers: adminAuth.authHeaders(),
      body: { apply: true, keep: settings.value.data.backupCount },
    })
    await gedcomStore.refreshFromServer()
    await loadBackups()
    message.value = { type: 'success', text: t('settings.data.marriedNames.done', { n: result.added }) }
  } catch (error: any) {
    message.value = { type: 'error', text: t('settings.data.marriedNames.failed', { error: error?.data?.statusMessage || error?.message || '' }) }
  } finally {
    marriedNamesBusy.value = false
  }
}

watch([() => adminAuth.canEdit.value, () => adminAuth.databaseId.value, activeSection], ([canEdit, , section]) => {
  if (canEdit && section === 'data') loadBackups()
}, { immediate: true })

// What's new in the current version (utils/releaseNotes.ts), with a link to all release notes
const releaseNotes = useReleaseNotes()

// Filled in at build time by nuxt.config.ts
const build = useRuntimeConfig().public.build as { version: string; number: string; time: string; commit: string }
// The time is shown in the viewer's time zone, which the server does not know: render it only in the browser
const isClient = ref(false)
onMounted(() => { isClient.value = true })
const builtAt = computed(() => new Date(build.time).toLocaleString(settings.value.language === 'cs' ? 'cs-CZ' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' }))

const cardClass = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6'
const selectClass = 'px-4 py-2 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white'
const rangeClass = 'w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer'
const buttonClass = 'px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors font-medium'
</script>

<template>
  <div class="min-h-screen">
    <div class="mb-6">
      <h1 class="text-3xl font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
        {{ t('settings.title') }}
      </h1>
      <p class="text-lg opacity-75 mt-1" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
        {{ t('settings.subtitle') }}
      </p>
    </div>

    <p
      v-if="message"
      :role="message.type === 'error' ? 'alert' : 'status'"
      class="mb-4 rounded border p-3 text-sm"
      :class="message.type === 'error'
        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        : 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'"
    >
      {{ message.text }}
    </p>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div class="lg:col-span-1">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <nav class="p-2">
            <button
              v-for="section in sections"
              :key="section.id"
              @click="activeSection = section.id"
              class="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left"
              :class="{
                'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300': activeSection === section.id,
                'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50': activeSection !== section.id,
              }"
            >
              <span>{{ section.icon }}</span>
              <span>{{ t(`settings.section.${section.id}`) }}</span>
            </button>
          </nav>
        </div>

        <div class="mt-6 space-y-3">
          <p class="text-sm opacity-70" :class="{ 'text-gray-300': isDark, 'text-gray-600': !isDark }">
            {{ t('settings.autosaved') }}
          </p>
          <button @click="resetToDefaults" class="w-full" :class="buttonClass">
            {{ t('settings.reset') }}
          </button>
          <div class="flex gap-3">
            <button @click="exportSettings" class="flex-1 text-sm" :class="buttonClass">
              {{ t('settings.export') }}
            </button>
            <label class="flex-1 text-sm text-center cursor-pointer" :class="buttonClass">
              {{ t('settings.import') }}
              <input type="file" accept=".json" @change="importSettings" class="hidden">
            </label>
          </div>
        </div>
      </div>

      <div class="lg:col-span-3">
        <div v-if="activeSection === 'general'" :class="cardClass">
          <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('settings.general.title') }}
          </h2>

          <NuxtLink
            v-if="adminAuth.canEditPlaces.value"
            to="/admin/locations"
            class="mb-6 inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:border-primary-500 dark:border-gray-600"
          >
            {{ t('settings.general.locations') }}
          </NuxtLink>
          <NuxtLink
            v-if="adminAuth.isSystemAdmin.value"
            to="/admin/layers"
            class="mb-6 ml-3 inline-flex items-center rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:border-primary-500 dark:border-gray-600"
          >
            {{ t('settings.general.layers') }}
          </NuxtLink>

          <div class="space-y-6">
            <div>
              <div class="font-medium mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ t('settings.general.theme') }}
              </div>
              <div class="grid grid-cols-3 gap-4">
                <button
                  v-for="theme in themeOptions"
                  :key="theme.value"
                  @click="setTheme(theme.value)"
                  class="p-4 rounded-lg border-2 transition-all text-center"
                  :class="{
                    'border-primary-500 bg-primary-50 dark:bg-primary-900/20': colorMode.preference === theme.value,
                    'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600': colorMode.preference !== theme.value,
                  }"
                >
                  <div class="text-3xl mb-2">{{ theme.icon }}</div>
                  <div class="text-sm font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                    {{ t(`settings.general.theme.${theme.value}`) }}
                  </div>
                </button>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <label for="language" class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ t('settings.general.language') }}
              </label>
              <select id="language" v-model="settings.language" :class="selectClass">
                <option v-for="language in LANGUAGES" :key="language.value" :value="language.value">{{ language.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <div v-if="activeSection === 'map'" :class="cardClass">
          <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('settings.map.title') }}
          </h2>
          <div class="space-y-6">
            <div class="flex flex-col gap-2">
              <label for="map-zoom" class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ t('settings.map.zoom') }}: {{ settings.map.defaultZoom }}
              </label>
              <input id="map-zoom" v-model.number="settings.map.defaultZoom" type="range" min="1" max="18" :class="rangeClass">
              <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('settings.map.zoomHint') }}</p>
            </div>
            <div class="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <SettingsToggle v-model="settings.map.showClusters" icon="🎯" :label="t('settings.map.clusters')" :description="t('settings.map.clustersHint')" />
              <SettingsToggle v-model="settings.map.showMigrationLines" icon="✈️" :label="t('settings.map.migration')" :description="t('settings.map.migrationHint')" />
            </div>
          </div>
        </div>

        <div v-if="activeSection === 'tree'" :class="cardClass">
          <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('settings.tree.title') }}
          </h2>
          <div class="space-y-6">
            <div class="flex flex-col gap-2">
              <label for="default-view" class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ t('settings.tree.defaultView') }}
              </label>
              <select id="default-view" v-model="settings.tree.defaultView" :class="selectClass">
                <option v-for="view in treeViews" :key="view" :value="view">{{ t(`settings.tree.view.${view}`) }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-2">
              <label for="max-generations" class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                {{ t('settings.tree.maxGenerations') }}: {{ settings.tree.maxGenerations }}
              </label>
              <input id="max-generations" v-model.number="settings.tree.maxGenerations" type="range" min="1" max="20" :class="rangeClass">
              <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('settings.tree.maxGenerationsHint') }}</p>
            </div>
            <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
              <SettingsToggle v-model="settings.tree.showDetails" icon="📋" :label="t('settings.tree.showDetails')" :description="t('settings.tree.showDetailsHint')" />
            </div>
          </div>
        </div>

        <div v-if="activeSection === 'data'" class="space-y-6">
          <div :class="cardClass">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ t('settings.data.title') }}
            </h2>
            <div class="space-y-6">
              <SettingsToggle v-model="settings.data.autoSave" icon="💾" :label="t('settings.data.autoSave')" :description="t('settings.data.autoSaveHint')" />
              <SettingsToggle v-model="settings.data.backupOnImport" icon="📥" :label="t('settings.data.backupOnImport')" :description="t('settings.data.backupOnImportHint')" />
              <div class="flex flex-col gap-2">
                <label for="backup-count" class="font-medium" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
                  {{ t('settings.data.backupCount') }}: {{ settings.data.backupCount }}
                </label>
                <input id="backup-count" v-model.number="settings.data.backupCount" type="range" min="1" max="20" :class="rangeClass">
              </div>
            </div>
          </div>

          <div :class="cardClass">
            <h3 class="text-lg font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ t('settings.data.backups') }}
            </h3>
            <div v-if="!adminAuth.canEdit.value" class="space-y-3">
              <p class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('settings.data.backupsAdminOnly') }}</p>
              <AdminLogin />
            </div>
            <p v-else-if="!backupsLoading && !backups.length" class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              {{ t('settings.data.backupsEmpty') }}
            </p>
            <table v-else-if="backups.length" class="w-full text-sm">
              <thead>
                <tr class="text-left border-b border-gray-200 dark:border-gray-700">
                  <th class="py-2">{{ t('settings.data.backupCreated') }}</th>
                  <th class="py-2">{{ t('settings.data.backupSize') }}</th>
                  <th class="py-2">{{ t('settings.data.backupAttachments') }}</th>
                  <th class="py-2"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="backup in backups" :key="backup.id" class="border-b border-gray-100 dark:border-gray-700/50">
                  <td class="py-2">{{ formatDate(backup.createdAt) }}</td>
                  <td class="py-2">{{ formatSize(backup.size) }}</td>
                  <td class="py-2">{{ backup.attachments ?? 0 }}</td>
                  <td class="py-2 text-right">
                    <button v-if="adminAuth.canManage.value" class="px-3 py-1 rounded border border-gray-300 dark:border-gray-600" @click="restoreBackup(backup)">{{ t('settings.data.restore') }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="adminAuth.canManage.value" :class="cardClass" data-married-names>
            <h3 class="text-lg font-bold mb-2" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ t('settings.data.marriedNames.title') }}
            </h3>
            <p class="mb-4 text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('settings.data.marriedNames.hint') }}</p>
            <button
              type="button"
              class="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 font-medium disabled:opacity-60"
              :disabled="marriedNamesBusy"
              data-take-married-names
              @click="takeMarriedNames"
            >{{ marriedNamesBusy ? t('settings.data.marriedNames.running') : t('settings.data.marriedNames.button') }}</button>
          </div>
        </div>

        <div v-if="activeSection === 'privacy'" class="space-y-6">
          <div :class="cardClass">
            <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ t('settings.privacy.title') }}
            </h2>
            <SettingsToggle
              :model-value="anon.enabled.value"
              :disabled="!adminAuth.canRead.value"
              icon="👤"
              :label="t('settings.privacy.anonymous')"
              :description="adminAuth.canRead.value ? t('settings.privacy.anonymousHint') : t('settings.privacy.anonymousForced')"
              @update:model-value="settings.privacy.anonymousMode = $event"
            />
          </div>
          <div :class="cardClass">
            <h3 class="text-lg font-bold mb-4" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
              {{ t('settings.privacy.dataTitle') }}
            </h3>
            <p class="text-sm opacity-75" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
              {{ t('settings.privacy.dataText') }}
            </p>
          </div>
        </div>

        <div v-if="activeSection === 'about'" :class="cardClass">
          <h2 class="text-xl font-bold mb-6" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">
            {{ t('settings.about.title') }}
          </h2>
          <div class="space-y-4">
            <div class="flex items-start gap-4">
              <span class="text-3xl">🌳</span>
              <div>
                <h3 class="font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('settings.about.version', { version: build.version }) }}</h3>
                <p data-build-number class="text-sm" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">
                  {{ t('settings.about.build', { number: build.number }) }}<template v-if="build.commit"> · {{ t('settings.about.commit', { commit: build.commit }) }}</template>
                </p>
                <p v-if="isClient" data-build-time class="text-sm" :class="{ 'text-gray-300': isDark, 'text-gray-700': !isDark }">{{ t('settings.about.builtAt', { date: builtAt }) }}</p>
                <p class="text-sm opacity-60" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">{{ t('settings.about.built') }}</p>
              </div>
            </div>
            <div class="flex items-start gap-4" data-about-releases>
              <span class="text-3xl">🆕</span>
              <div class="min-w-0 flex-1">
                <h3 class="font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('releases.latest', { version: releaseNotes.latest.version }) }}</h3>
                <p class="mb-3 text-sm opacity-70">{{ releaseNotes.titleOf(releaseNotes.latest) }} · {{ releaseNotes.formatDate(releaseNotes.latest.date) }}</p>
                <ReleaseNotesList :releases="[releaseNotes.latest]" hide-heading />
                <NuxtLink to="/release-notes" class="mt-3 inline-block text-sm font-medium text-primary-700 underline dark:text-primary-300">{{ t('releases.all') }}</NuxtLink>
              </div>
            </div>
            <div class="flex items-start gap-4">
              <span class="text-3xl">ℹ️</span>
              <div>
                <h3 class="font-bold" :class="{ 'text-white': isDark, 'text-gray-900': !isDark }">{{ t('settings.about.features') }}</h3>
                <ul class="text-sm list-disc list-inside mt-2 space-y-1" :class="{ 'text-gray-400': isDark, 'text-gray-600': !isDark }">
                  <li>{{ t('settings.about.f1') }}</li>
                  <li>{{ t('settings.about.f2') }}</li>
                  <li>{{ t('settings.about.f3') }}</li>
                  <li>{{ t('settings.about.f4') }}</li>
                  <li>{{ t('settings.about.f5') }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
