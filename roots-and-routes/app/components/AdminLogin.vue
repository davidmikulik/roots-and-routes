<script setup lang="ts">
// Login with a user name and password (composables/useAdminAuth.ts); once logged in, who is logged in and logout
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const emit = defineEmits<{ (event: 'done'): void }>()

const adminAuth = useAdminAuth()
const { t } = useT()
const username = ref('')
const password = ref('')
const isChecking = ref(false)
const errorMessage = ref('')

const submit = async () => {
  isChecking.value = true
  errorMessage.value = ''
  try {
    await adminAuth.login(username.value, password.value)
    password.value = ''
    emit('done')
  } catch (error: any) {
    const status = error?.statusCode || error?.response?.status
    const reason = String(error?.data?.statusMessage || error?.statusMessage || '')
    errorMessage.value = status === 401 && reason.startsWith('First login') ? t('auth.firstLogin')
      : status === 401 ? t('auth.invalidCredentials')
      : status === 503 ? t('admin.unavailable')
      : error?.message || t('admin.loginFailed')
  } finally {
    isChecking.value = false
  }
}

const logout = () => {
  adminAuth.logout()
  emit('done')
}
</script>

<template>
  <div class="text-sm">
    <div v-if="adminAuth.isLoggedIn.value" class="flex flex-wrap items-center gap-3">
      <span class="font-medium text-green-700 dark:text-green-400">
        {{ t('auth.loggedInAs', { name: adminAuth.user.value?.username || '' }) }}
        ({{ t(`auth.level.${adminAuth.user.value?.role}` as MessageKey) }})
      </span>
      <button type="button" class="px-3 py-1 rounded border" @click="logout">{{ t('admin.logout') }}</button>
    </div>
    <form v-else class="flex flex-col gap-2" data-login-form @submit.prevent="submit">
      <p class="font-medium">{{ t('admin.login') }}</p>
      <label class="flex flex-col gap-1">
        <span>{{ t('auth.username') }}</span>
        <input
          v-model="username"
          type="text"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          class="px-3 py-1 rounded border bg-transparent"
        >
      </label>
      <label class="flex flex-col gap-1">
        <span>{{ t('auth.password') }}</span>
        <input
          v-model="password"
          type="password"
          name="password"
          autocomplete="current-password"
          class="px-3 py-1 rounded border bg-transparent"
        >
      </label>
      <button type="submit" :disabled="isChecking" class="self-start px-4 py-1.5 rounded bg-primary-600 text-white disabled:opacity-50">
        {{ isChecking ? t('admin.checking') : t('admin.submit') }}
      </button>
      <p v-if="errorMessage" role="alert" class="text-red-600 dark:text-red-400">{{ errorMessage }}</p>
    </form>
  </div>
</template>
