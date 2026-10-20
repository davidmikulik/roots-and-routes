// User preferences. Stored in this browser's localStorage and saved automatically on every change.
import { BASE_LAYER_IDS, HISTORIC_LAYER_IDS, LEGACY_HISTORIC_LAYER_IDS, OVERLAY_LAYER_IDS } from '~~/utils/map/layers'
import { isCustomLayerId } from '~~/utils/map/mapLayers'

// A stored historical layer id, with the former choices mapped to the current ones. A custom layer (custom:<id>)
// is kept even when it does not exist (yet): the layers are loaded only for the administrator
const historicLayerId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const id = LEGACY_HISTORIC_LAYER_IDS[value] ?? value
  return HISTORIC_LAYER_IDS.includes(id) || isCustomLayerId(id) ? id : undefined
}

export type Language = 'en' | 'cs'
export type TreeView = 'tree' | 'chart' | 'list'

export interface AppSettings {
  language: Language
  // baseLayer / historicLayer / extraLayers (overlays switched on): ids from utils/map/layers.ts; historicOpacity 0–100 %
  map: { defaultZoom: number; showClusters: boolean; showMigrationLines: boolean; baseLayer: string; historicLayer: string; historicOpacity: number; placeNames: boolean; extraLayers: string[] }
  tree: { defaultView: TreeView; maxGenerations: number }
  data: { autoSave: boolean; backupOnImport: boolean; backupCount: number }
  privacy: { anonymousMode: boolean }
}

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'cs', label: 'Čeština' },
]

export const createDefaultSettings = (): AppSettings => ({
  language: 'en',
  map: { defaultZoom: 7, showClusters: true, showMigrationLines: false, baseLayer: 'osm', historicLayer: 'none', historicOpacity: 70, placeNames: false, extraLayers: [] },
  tree: { defaultView: 'list', maxGenerations: 10 },
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
      baseLayer: typeof map.baseLayer === 'string' && BASE_LAYER_IDS.includes(map.baseLayer) ? map.baseLayer : defaults.map.baseLayer,
      historicLayer: historicLayerId(map.historicLayer) ?? defaults.map.historicLayer,
      historicOpacity: int(map.historicOpacity, defaults.map.historicOpacity, 0, 100),
      placeNames: bool(map.placeNames, defaults.map.placeNames),
      extraLayers: Array.isArray(map.extraLayers)
        ? [...new Set(map.extraLayers.filter((id): id is string => typeof id === 'string' && OVERLAY_LAYER_IDS.includes(id)))]
        : defaults.map.extraLayers,
    },
    tree: {
      defaultView: tree.defaultView === 'tree' || tree.defaultView === 'chart' || tree.defaultView === 'list' ? tree.defaultView : defaults.tree.defaultView,
      maxGenerations: int(tree.maxGenerations, defaults.tree.maxGenerations, 1, 20),
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
