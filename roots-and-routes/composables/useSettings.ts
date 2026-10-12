// User preferences. Stored in this browser's localStorage and saved automatically on every change.
export type Language = 'en' | 'cs'
export type TreeView = 'tree' | 'chart' | 'list'

export interface AppSettings {
  language: Language
  map: { defaultZoom: number; showClusters: boolean; showMigrationLines: boolean }
  tree: { defaultView: TreeView; maxGenerations: number; showDetails: boolean }
  data: { autoSave: boolean; backupOnImport: boolean; backupCount: number }
  privacy: { anonymousMode: boolean }
}

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'cs', label: 'Čeština' },
]

export const createDefaultSettings = (): AppSettings => ({
  language: 'en',
  map: { defaultZoom: 7, showClusters: true, showMigrationLines: false },
  tree: { defaultView: 'list', maxGenerations: 10, showDetails: true },
  data: { autoSave: true, backupOnImport: true, backupCount: 5 },
  privacy: { anonymousMode: false },
})

const STORAGE_KEY = 'roots-and-routes-settings'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const int = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

// Merges untrusted input (localStorage, imported file) over the defaults; unknown or invalid values fall back
export const sanitizeSettings = (input: unknown): AppSettings => {
  const defaults = createDefaultSettings()
  if (!isRecord(input)) return defaults
  const map = isRecord(input.map) ? input.map : {}
  const tree = isRecord(input.tree) ? input.tree : {}
  const data = isRecord(input.data) ? input.data : {}
  const privacy = isRecord(input.privacy) ? input.privacy : {}
  // `data.language` is where the first version of the settings page kept the language
  const language = input.language ?? data.language
  return {
    language: language === 'cs' || language === 'en' ? language : defaults.language,
    map: {
      defaultZoom: int(map.defaultZoom, defaults.map.defaultZoom, 1, 18),
      showClusters: bool(map.showClusters, defaults.map.showClusters),
      showMigrationLines: bool(map.showMigrationLines, defaults.map.showMigrationLines),
    },
    tree: {
      defaultView: tree.defaultView === 'tree' || tree.defaultView === 'chart' || tree.defaultView === 'list' ? tree.defaultView : defaults.tree.defaultView,
      maxGenerations: int(tree.maxGenerations, defaults.tree.maxGenerations, 1, 20),
      showDetails: bool(tree.showDetails, defaults.tree.showDetails),
    },
    data: {
      autoSave: bool(data.autoSave, defaults.data.autoSave),
      backupOnImport: bool(data.backupOnImport, defaults.data.backupOnImport),
      backupCount: int(data.backupCount, defaults.data.backupCount, 1, 20),
    },
    privacy: { anonymousMode: bool(privacy.anonymousMode, defaults.privacy.anonymousMode) },
  }
}

export const useSettings = () => {
  const settings = useState<AppSettings>('app-settings', createDefaultSettings)
  // False until the saved settings were read after hydration; pages that apply a setting as an initial value watch it
  const ready = useState<boolean>('app-settings-ready', () => false)

  // Call once from app.vue onMounted (localStorage does not exist during prerender)
  const restore = () => {
    if (!import.meta.client || ready.value) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) settings.value = sanitizeSettings(JSON.parse(saved))
    } catch (error) {
      console.error('[SETTINGS] Failed to read saved settings:', error)
    }
    ready.value = true
    watch(settings, (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch (error) {
        console.error('[SETTINGS] Failed to save settings:', error)
      }
    }, { deep: true })
  }

  const reset = () => { settings.value = createDefaultSettings() }
  const replace = (input: unknown) => { settings.value = sanitizeSettings(input) }

  return { settings, ready, restore, reset, replace }
}
