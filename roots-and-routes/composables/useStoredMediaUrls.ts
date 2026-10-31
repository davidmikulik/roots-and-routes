// Files stored in the tree (media/<name>) are private: they are fetched with the session token and shown as blob:
// URLs, released when the list changes or the component unmounts (like PersonLinks.vue). For the images of source
// records (PersonSourceRecords.vue, page Sources).
import type { Ref } from 'vue'
import { useAdminAuth } from '~~/composables/useAdminAuth'

export const useStoredMediaUrls = (paths: Ref<string[]>) => {
  const adminAuth = useAdminAuth()
  const urls = ref(new Map<string, string>())
  const failed = ref(new Set<string>())
  const release = () => {
    for (const url of urls.value.values()) URL.revokeObjectURL(url)
    urls.value = new Map()
  }
  const key = computed(() => paths.value.filter(path => path.startsWith('media/')).join('|'))
  watch(key, async (current) => {
    release()
    failed.value = new Set()
    if (!current || !adminAuth.canRead.value || !import.meta.client) return
    const loaded = new Map<string, string>()
    const missing = new Set<string>()
    await Promise.all(current.split('|').map(async (path) => {
      try {
        const blob = await $fetch<Blob>(`/api/${path}`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
        loaded.set(path, URL.createObjectURL(blob))
      } catch (error) {
        missing.add(path)
        console.error(`[MEDIA] ${path} could not be loaded:`, error)
      }
    }))
    if (current === key.value) { urls.value = loaded; failed.value = missing } else for (const url of loaded.values()) URL.revokeObjectURL(url)
  }, { immediate: true })
  onUnmounted(release)
  return { urls, failed }
}
