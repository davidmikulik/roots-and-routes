import { requireActor } from '~~/server/utils/access'
import { saveKnownLocations } from '~~/server/utils/locationStorage'
import { normalizeLocationName } from '~~/utils/gedcom/locations'
import { parsePlaceLink } from '~~/utils/gedcom/archiveMaps'
import { loadMapLayers } from '~~/server/utils/mapLayerStorage'
import type { KnownLocation } from '~~/types/locations'

export default defineEventHandler(async (event) => {
  // Shared by all databases: administrators only (saving a person by others only reads it, see syncLocationsAfterEdit)
  await requireActor(event, 'admin')
  const body = await readBody<{ locations?: unknown }>(event)
  if (!Array.isArray(body?.locations) || body.locations.length > 10000) {
    throw createError({ statusCode: 400, statusMessage: 'Expected a list of at most 10,000 locations' })
  }

  const locations: KnownLocation[] = []
  const seenNames = new Set<string>()
  for (const value of body.locations) {
    if (!value || typeof value !== 'object') {
      throw createError({ statusCode: 400, statusMessage: 'Invalid location entry' })
    }
    const entry = value as Record<string, unknown>
    const name = typeof entry.name === 'string' ? entry.name.trim().replace(/\s+/g, ' ') : ''
    const latitude = entry.latitude === '' ? null : entry.latitude
    const longitude = entry.longitude === '' ? null : entry.longitude
    const key = normalizeLocationName(name)
    const pendingCoordinates = latitude === null && longitude === null
    const validCoordinates = typeof latitude === 'number' && typeof longitude === 'number'
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    if (!name || name.length > 300 || !key || (!pendingCoordinates && !validCoordinates)) {
      throw createError({ statusCode: 400, statusMessage: 'Each location needs a name and either both valid coordinates or neither coordinate' })
    }
    if (seenNames.has(key)) {
      throw createError({ statusCode: 400, statusMessage: `Duplicate location: ${name}` })
    }
    seenNames.add(key)
    // Links of the place (any http(s) address, ČÚZK archive links cleaned to typ + idrastru), without duplicates
    const archiveMaps: { url: string; title?: string }[] = []
    if (entry.archiveMaps !== undefined) {
      if (!Array.isArray(entry.archiveMaps) || entry.archiveMaps.length > 50) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid archive maps', message: `Invalid archive maps of ${name}` })
      }
      for (const map of entry.archiveMaps) {
        const raw = map as { url?: unknown; title?: unknown }
        const parsed = parsePlaceLink(typeof raw?.url === 'string' ? raw.url : '', typeof raw?.title === 'string' ? raw.title : undefined)
        // statusMessage goes into the HTTP status line, which cannot carry diacritics; the place is in message
        if (!parsed) throw createError({ statusCode: 400, statusMessage: 'Not a valid http(s) link', message: `Not a valid http(s) link (${name})` })
        if (!archiveMaps.some(existing => existing.url === parsed.url)) archiveMaps.push({ url: parsed.url, ...(parsed.title ? { title: parsed.title } : {}) })
      }
    }
    locations.push({
      name,
      latitude: pendingCoordinates ? null : latitude as number,
      longitude: pendingCoordinates ? null : longitude as number,
      ...(archiveMaps.length ? { archiveMaps } : {}),
    })
  }

  // The uploaded sheets of the places moved to the map layers; make sure they did before the catalog drops them
  await loadMapLayers()
  await saveKnownLocations(locations)
  return { success: true, count: locations.length }
})
