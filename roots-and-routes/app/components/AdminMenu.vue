<script setup lang="ts">
// The administrator's actions, in the panel under the lock in the header once logged in: import and export of the
// tree, known places, map layers, backups and data, logout. The home page has none of them, so visitors see only
// what they can use.
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const emit = defineEmits<{ (event: 'navigate'): void }>()
const adminAuth = useAdminAuth()
const { t } = useT()
const route = useRoute()

const ADMIN_LINKS: { to: string; icon: string; label: MessageKey; hint: MessageKey }[] = [
  { to: '/gedcom', icon: '📁', label: 'admin.menu.gedcom', hint: 'admin.menu.gedcomHint' },
  { to: '/admin/locations', icon: '📍', label: 'admin.menu.locations', hint: 'admin.menu.locationsHint' },
  { to: '/admin/layers', icon: '🗺️', label: 'admin.menu.layers', hint: 'admin.menu.layersHint' },
  { to: '/settings?section=data', icon: '💾', label: 'admin.menu.data', hint: 'admin.menu.dataHint' },
]

const logout = () => {
  adminAuth.logout()
  emit('navigate')
}
</script>

<template>
  <div class="text-sm" data-admin-menu>
    <p class="mb-2 font-medium text-green-700 dark:text-green-400">{{ t('admin.mode') }}</p>
    <nav :aria-label="t('admin.menu.title')">
      <NuxtLink
        v-for="link in ADMIN_LINKS"
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
