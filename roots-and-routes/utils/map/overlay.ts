// Shared validation of a georeferenced overlay (a scanned sheet the user uploaded). Used by the server when saving
// known locations and by the client before sending them, so an invalid overlay never reaches the Blob catalog.
import type { MapOverlay, OverlayPoint } from '~~/types/locations'

export const OVERLAY_FILE = /^media\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/
const MAX_POINTS = 30
const MAX_PIXELS = 60000

const isPoint = (value: unknown): value is OverlayPoint => {
  const p = value as Partial<OverlayPoint>
  return !!p && ['px', 'py', 'x', 'y'].every(key => Number.isFinite((p as Record<string, unknown>)[key] as number))
}

// Returns the clean overlay, or null when the shape is wrong. Keeps only the known fields.
export function sanitizeOverlay(value: unknown): MapOverlay | null {
  const o = value as Partial<MapOverlay>
  if (!o || typeof o !== 'object') return null
  if (typeof o.id !== 'string' || !/^[0-9a-f-]{6,40}$/.test(o.id)) return null
  if (typeof o.file !== 'string' || !OVERLAY_FILE.test(o.file)) return null
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > 300) return null
  if (o.source !== undefined && (typeof o.source !== 'string' || o.source.length > 500)) return null
  if (!Number.isInteger(o.width) || !Number.isInteger(o.height) || o.width! < 1 || o.height! < 1 || o.width! > MAX_PIXELS || o.height! > MAX_PIXELS) return null
  if (!Array.isArray(o.points) || o.points.length < 3 || o.points.length > MAX_POINTS || !o.points.every(isPoint)) return null
  return {
    id: o.id,
    file: o.file,
    title: o.title.trim(),
    ...(o.source?.trim() ? { source: o.source.trim() } : {}),
    width: o.width!,
    height: o.height!,
    points: o.points.map(p => ({ px: p.px, py: p.py, x: p.x, y: p.y })),
  }
}
