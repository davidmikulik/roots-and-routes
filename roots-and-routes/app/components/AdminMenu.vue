<script setup lang="ts">
// The panel under the lock in the header once logged in: who is logged in, the database they work on (switching),
// the actions their permissions allow (import and export, known places, map layers, backups, users) and logout.
// The home page has none of them, so visitors see only what they can use.
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const emit = defineEmits<{ (event: 'navigate'): void }>()
const adminAuth = useAdminAuth()
const { t } = useT()
const route = useRoute()
// Not useGedcomStore(): it would load the tree again whenever the panel opens (see AGENTS.md)
const gedcomState = useState<{ dirty?: boolean } | null>('gedcom-store')

type Permission = 'canEdit' | 'canEditPlaces' | 'isSystemAdmin' | 'isLoggedIn'
const LINKS: { to: string; icon: string; label: MessageKey; hint: MessageKey; needs: Permission }[] = [
  { to: '/gedcom', icon: '📁', label: 'admin.menu.gedcom', hint: 'admin.menu.gedcomHint', needs: 'canEdit' },
  { to: '/admin/locations', icon: '📍', label: 'admin.menu.locations', hint: 'admin.menu.locationsHint', needs: 'canEditPlaces' },
  { to: '/admin/layers', icon: '🗺️', label: 'admin.menu.layers', hint: 'admin.menu.layersHint', needs: 'isSystemAdmin' },
  { to: '/settings?section=data', icon: '💾', label: 'admin.menu.data', hint: 'admin.menu.dataHint', needs: 'canEdit' },
  { to: '/account', icon: '👤', label: 'admin.menu.account', hint: 'admin.menu.accountHint', needs: 'isLoggedIn' },
  { to: '/admin/users', icon: '👥', label: 'admin.menu.users', hint: 'admin.menu.usersHint', needs: 'isSystemAdmin' },
]
const links = computed(() => LINKS.filter(link => adminAuth[link.needs].value))

// Unsaved edits belong to the database they were made in: switching would lose them
const switchBlocked = computed(() => !!gedcomState.value?.dirty)
const selectDatabase = (event: Event) => adminAuth.selectDatabase((event.target as HTMLSelectElement).value)

const logout = () => {
  adminAuth.logout()
  emit('navigate')
}
</script>

<template>
  <div class="text-sm" data-admin-menu>
    <p class="mb-2 font-medium text-green-700 dark:text-green-400">
      {{ t('auth.loggedInAs', { name: adminAuth.user.value?.username || '' }) }}
      <span class="font-normal opacity-80">({{ t(`auth.level.${adminAuth.user.value?.role}` as MessageKey) }})</span>
    </p>
    <label v-if="adminAuth.databases.value.length" class="mb-3 block">
      <span class="mb-1 block text-xs font-semibold uppercase tracking-wide opacity-70">{{ t('auth.database') }}</span>
      <select
        :value="adminAuth.databaseId.value"
        :disabled="switchBlocked"
        class="w-full rounded border bg-transparent px-2 py-1.5"
        data-database-select
        @change="selectDatabase"
      >
        <option v-for="db in adminAuth.databases.value" :key="db.id" :value="db.id" class="text-gray-900">
          {{ db.name }} – {{ t(`auth.level.${db.level}` as MessageKey) }}{{ db.owned ? '' : db.ownerName ? ` (${db.ownerName})` : '' }}
        </option>
      </select>
      <span v-if="switchBlocked" class="mt-1 block text-xs text-amber-700 dark:text-amber-400">{{ t('auth.switchBlocked') }}</span>
    </label>
    <p v-else class="mb-3 text-xs opacity-70">{{ t('auth.noDatabase') }}</p>
    <nav :aria-label="t('admin.menu.title')">
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
        :class="route.fullPath === link.to ? 'bg-primary-50 dark:bg-primary-900/30' : ''"
        :data-admin-link="link.to"
        @click="emit('navigate')"
      >
        <span class="text-lg leading-5" aria-hidden="true">{{ link.icon }}</span>
        <span>
          <span class="block font-medium">{{ t(link.label) }}</span>
          <span class="block text-xs opacity-70">{{ t(link.hint) }}</span>
        </span>
      </NuxtLink>
    </nav>
    <button type="button" class="mt-3 w-full rounded border px-3 py-1.5" data-admin-logout @click="logout">{{ t('admin.logout') }}</button>
  </div>
</template>
