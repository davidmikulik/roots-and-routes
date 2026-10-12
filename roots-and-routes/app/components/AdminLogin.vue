<script setup lang="ts">
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useT } from '~~/composables/useT'

const emit = defineEmits<{ (event: 'done'): void }>()

const adminAuth = useAdminAuth()
const { t } = useT()
const tokenInput = ref('')
const isChecking = ref(false)
const errorMessage = ref('')

const submit = async () => {
  isChecking.value = true
  errorMessage.value = ''
  try {
    await adminAuth.login(tokenInput.value)
    tokenInput.value = ''
    emit('done')
  } catch (error: any) {
    const status = error?.statusCode || error?.response?.status
    errorMessage.value = status === 401 ? t('admin.invalidToken')
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
    <div v-if="adminAuth.isAdmin.value" class="flex items-center gap-3">
      <span class="font-medium text-green-700 dark:text-green-400">{{ t('admin.mode') }}</span>
      <button type="button" class="px-3 py-1 rounded border" @click="logout">{{ t('admin.logout') }}</button>
    </div>
    <form v-else class="flex flex-col gap-2" @submit.prevent="submit">
      <label for="admin-token" class="font-medium">{{ t('admin.token') }}</label>
      <div class="flex gap-2">
        <input
          id="admin-token"
          v-model="tokenInput"
          type="password"
          autocomplete="current-password"
          class="flex-1 min-w-0 px-3 py-1 rounded border bg-transparent"
        >
        <button type="submit" :disabled="isChecking" class="px-3 py-1 rounded bg-primary-600 text-white disabled:opacity-50">
          {{ isChecking ? t('admin.checking') : t('admin.submit') }}
        </button>
      </div>
      <p v-if="errorMessage" class="text-red-600 dark:text-red-400">{{ errorMessage }}</p>
    </form>
  </div>
</template>
