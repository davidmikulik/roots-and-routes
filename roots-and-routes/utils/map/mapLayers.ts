// Shared validation of the custom map layers (scanned sheets the administrator uploaded, grouped in named layers).
// Used by the server when saving map-layers.json and by the client before sending, so an invalid layer never
// reaches the Blob store.
import type { ControlPoint, CustomLayer, MapSheet } from '~~/types/mapLayers'

export const SHEET_FILE = /^media\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/
export const MIN_POINTS = 3
export const MAX_POINTS = 30
export const MAX_SHEETS = 50
export const MAX_LAYERS = 50
export const MAX_TITLE = 300
const MAX_PIXELS = 60000
const ID = /^[0-9a-z-]{4,40}$/

// The historical layer id of a custom layer in the settings and the map's layer choice
export const CUSTOM_LAYER_PREFIX = 'custom:'
export const customLayerId = (layer: { id: string }): string => `${CUSTOM_LAYER_PREFIX}${layer.id}`
export const isCustomLayerId = (value: string): boolean =>
  value.startsWith(CUSTOM_LAYER_PREFIX) && ID.test(value.slice(CUSTOM_LAYER_PREFIX.length))
// The layer the former "my uploaded sheets" were moved into (server/utils/mapLayerStorage.ts)
export const MIGRATED_LAYER_ID = 'uploaded'

export const newLayerId = (): string => crypto.randomUUID().slice(0, 8)

const isPoint = (value: unknown): value is ControlPoint => {
  const p = value as Record<string, unknown> | null
  return !!p && typeof p === 'object' && ['px', 'py', 'x', 'y'].every(key => Number.isFinite(p[key] as number))
}

const cleanTitle = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const title = value.trim().replace(/\s+/g, ' ')
  return title && title.length <= MAX_TITLE ? title : null
}

// Returns the clean sheet, or null when the shape is wrong. Keeps only the known fields.
export function sanitizeSheet(value: unknown): MapSheet | null {
  const o = value as Partial<MapSheet> | null
  if (!o || typeof o !== 'object') return null
  if (typeof o.id !== 'string' || !ID.test(o.id)) return null
  if (typeof o.file !== 'string' || !SHEET_FILE.test(o.file)) return null
  const title = cleanTitle(o.title)
  if (!title) return null
  if (o.source !== undefined && o.source !== null && (typeof o.source !== 'string' || o.source.length > 500)) return null
  if (!Number.isInteger(o.width) || !Number.isInteger(o.height) || o.width! < 1 || o.height! < 1 || o.width! > MAX_PIXELS || o.height! > MAX_PIXELS) return null
  if (!Array.isArray(o.points) || o.points.length < MIN_POINTS || o.points.length > MAX_POINTS || !o.points.every(isPoint)) return null
  return {
    id: o.id,
    file: o.file,
    title,
    ...(o.source?.trim() ? { source: o.source.trim() } : {}),
    width: o.width!,
    height: o.height!,
    points: o.points.map(p => ({ px: p.px, py: p.py, x: p.x, y: p.y })),
  }
}

export function sanitizeCustomLayer(value: unknown): CustomLayer | null {
  const o = value as Partial<CustomLayer> | null
  if (!o || typeof o !== 'object') return null
  if (typeof o.id !== 'string' || !ID.test(o.id)) return null
  const title = cleanTitle(o.title)
  if (!title) return null
  if (!Array.isArray(o.sheets) || o.sheets.length > MAX_SHEETS) return null
  const sheets: MapSheet[] = []
  for (const raw of o.sheets) {
    const sheet = sanitizeSheet(raw)
    if (!sheet || sheets.some(existing => existing.id === sheet.id)) return null
    sheets.push(sheet)
  }
  return { id: o.id, title, sheets }
}

// The whole list, or null when any layer is invalid or two layers share an id
export function sanitizeCustomLayers(value: unknown): CustomLayer[] | null {
  if (!Array.isArray(value) || value.length > MAX_LAYERS) return null
  const layers: CustomLayer[] = []
  for (const raw of value) {
    const layer = sanitizeCustomLayer(raw)
    if (!layer || layers.some(existing => existing.id === layer.id)) return null
    layers.push(layer)
  }
  return layers
}
