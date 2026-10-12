// Admin token for all data-changing actions. Kept in localStorage so it survives reloads;
// the server re-checks it on every write (server/middleware/adminWrites.ts).
const STORAGE_KEY = 'roots-and-routes-admin-token'

export const useAdminAuth = () => {
  const token = useState<string>('admin-token', () => '')
  const isAdmin = computed(() => token.value !== '')

  const authHeaders = (): Record<string, string> =>
    token.value ? { Authorization: `Bearer ${token.value}` } : {}

  // Call from onMounted only: localStorage is not available during SSR/prerender
  const restore = () => {
    if (import.meta.client && !token.value) token.value = localStorage.getItem(STORAGE_KEY) || ''
  }

  const login = async (candidate: string): Promise<void> => {
    const trimmed = candidate.trim()
    if (!trimmed) throw new Error('Enter the administrator token.')
    await $fetch('/api/admin/verify', { headers: { Authorization: `Bearer ${trimmed}` } })
    token.value = trimmed
    localStorage.setItem(STORAGE_KEY, trimmed)
  }

  const logout = () => {
    token.value = ''
    if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
  }

  const requireAdmin = () => {
    if (!isAdmin.value) throw new Error('Administrator login is required for changes.')
  }

  return { token, isAdmin, authHeaders, restore, login, logout, requireAdmin }
}
