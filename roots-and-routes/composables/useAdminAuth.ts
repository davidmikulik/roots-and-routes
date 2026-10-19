// The logged-in user, their databases and the one they work on. The session token, the user and the list of
// databases are kept in localStorage (so the permissions are known right after a reload) and refreshed from
// GET /api/auth/me; the server checks the token and the permission on every request (server/utils/access.ts).
// Every request about a tree sends the chosen database in the header X-Database (authHeaders()).
import type { AccessLevel, DatabaseInfo, SessionInfo, SessionUser } from '~~/types/accounts'
import { levelAtLeast } from '~~/utils/accessLevels'
import { useT } from '~~/composables/useT'

const SESSION_KEY = 'roots-and-routes-session'
const DATABASE_KEY = 'roots-and-routes-database'
// The admin token of the single-user version; dropped, the user logs in with a name and password
const LEGACY_TOKEN_KEY = 'roots-and-routes-admin-token'

interface StoredSession extends SessionInfo { token: string }

let refreshing: Promise<void> | null = null

export const useAdminAuth = () => {
  const { t } = useT()
  const token = useState<string>('auth-token', () => '')
  const user = useState<SessionUser | null>('auth-user', () => null)
  const databases = useState<DatabaseInfo[]>('auth-databases', () => [])
  const databaseId = useState<string>('auth-database', () => '')

  const isLoggedIn = computed(() => token.value !== '' && !!user.value)
  const database = computed(() => databases.value.find(db => db.id === databaseId.value) || null)
  // The level on the chosen database; null for visitors (they see the public database anonymized)
  const level = computed<AccessLevel | null>(() => (isLoggedIn.value ? database.value?.level || null : null))
  // Full data (not anonymized) of the chosen database
  const canRead = computed(() => levelAtLeast(level.value, 'read'))
  const canEdit = computed(() => levelAtLeast(level.value, 'edit'))
  // Import replacing the tree, restoring backups, sharing the database
  const canManage = computed(() => level.value === 'admin')
  // Users, map layers and every database
  const isSystemAdmin = computed(() => isLoggedIn.value && user.value?.role === 'admin')
  // The shared catalog of known places (role, not the level on a database)
  const canEditPlaces = computed(() => isLoggedIn.value && levelAtLeast(user.value?.role, 'edit'))
  // What the loaded tree depends on: the store reloads when it changes
  const dataKey = computed(() => `${token.value ? user.value?.id : ''}|${isLoggedIn.value ? databaseId.value : ''}|${canRead.value}`)

  // `forDatabase`: the database a change belongs to (the store saves into the one it loaded, see useGedcomStore)
  const authHeaders = (forDatabase?: string | null): Record<string, string> => {
    if (!token.value) return {}
    const db = forDatabase || databaseId.value
    return { Authorization: `Bearer ${token.value}`, ...(db ? { 'X-Database': db } : {}) }
  }

  const persist = () => {
    if (!import.meta.client) return
    if (token.value && user.value) {
      const stored: StoredSession = { token: token.value, user: user.value, databases: databases.value, defaultDatabaseId: null }
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
    if (databaseId.value) localStorage.setItem(DATABASE_KEY, databaseId.value)
  }

  const apply = (info: SessionInfo) => {
    user.value = info.user
    databases.value = info.databases
    // Keep the chosen database while it is still available, otherwise the default one
    if (!info.databases.some(db => db.id === databaseId.value)) databaseId.value = info.defaultDatabaseId || info.databases[0]?.id || ''
    persist()
  }

  const clearSession = () => {
    token.value = ''
    user.value = null
    databases.value = []
    persist()
  }

  // Asks the server who is logged in (the role, the databases or their sharing may have changed meanwhile)
  const refresh = async (): Promise<void> => {
    if (!import.meta.client || !token.value) return
    refreshing ??= (async () => {
      try {
        apply(await $fetch<SessionInfo>('/api/auth/me', { headers: { Authorization: `Bearer ${token.value}` } }))
      } catch (error: any) {
        const status = error?.statusCode || error?.response?.status
        // An expired session, a changed password or a deleted user; a network failure keeps the session
        if (status === 401) clearSession()
        else console.error('[AUTH] Session could not be refreshed:', error)
      } finally {
        refreshing = null
      }
    })()
    await refreshing
  }

  // Call from onMounted only: localStorage is not available during SSR/prerender
  const restore = () => {
    if (!import.meta.client || token.value) return
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as StoredSession | null
      if (stored?.token && stored.user) {
        token.value = stored.token
        user.value = stored.user
        databases.value = stored.databases || []
        const saved = localStorage.getItem(DATABASE_KEY) || ''
        databaseId.value = databases.value.some(db => db.id === saved) ? saved : databases.value[0]?.id || ''
        void refresh()
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
  }

  const login = async (username: string, password: string): Promise<void> => {
    if (!username.trim() || !password) throw new Error(t('auth.enterCredentials'))
    const response = await $fetch<SessionInfo & { token: string }>('/api/auth/login', { method: 'POST', body: { username: username.trim(), password } })
    token.value = response.token
    databaseId.value = import.meta.client ? localStorage.getItem(DATABASE_KEY) || '' : ''
    apply(response)
  }

  const logout = () => {
    clearSession()
    databaseId.value = ''
    if (import.meta.client) localStorage.removeItem(DATABASE_KEY)
  }

  const selectDatabase = (id: string) => {
    if (!databases.value.some(db => db.id === id)) return
    databaseId.value = id
    persist()
  }

  const changePassword = async (current: string, password: string): Promise<void> => {
    const response = await $fetch<{ token: string }>('/api/auth/password', { method: 'POST', headers: authHeaders(), body: { current, password } })
    token.value = response.token
    persist()
  }

  const requireRead = () => {
    if (!canRead.value) throw new Error(t('auth.readRequired'))
  }
  const requireEdit = () => {
    if (!canEdit.value) throw new Error(t('admin.required'))
  }
  const requireSystemAdmin = () => {
    if (!isSystemAdmin.value) throw new Error(t('auth.adminRequired'))
  }

  return {
    token, user, databases, databaseId, database, level,
    isLoggedIn, canRead, canEdit, canManage, isSystemAdmin, canEditPlaces, dataKey,
    authHeaders, restore, refresh, login, logout, selectDatabase, changePassword,
    requireRead, requireEdit, requireSystemAdmin,
  }
}
