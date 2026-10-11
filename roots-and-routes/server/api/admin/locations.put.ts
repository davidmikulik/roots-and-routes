import { requireAdminToken } from '~~/server/utils/adminAuth'
import { saveKnownLocations } from '~~/server/utils/locationStorage'
import { normalizeLocationName } from '~~/utils/gedcom/locations'
import type { KnownLocation } from '~~/types/locations'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
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
    const entry = value as Partial<KnownLocation>
    const name = typeof entry.name === 'string' ? entry.name.trim().replace(/\s+/g, ' ') : ''
    const latitude = entry.latitude
    const longitude = entry.longitude
    const key = normalizeLocationName(name)
    if (!name || name.length > 300 || !key || typeof latitude !== 'number' || typeof longitude !== 'number'
      || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw createError({ statusCode: 400, statusMessage: 'Each location needs a name and valid latitude/longitude' })
    }
    if (seenNames.has(key)) {
      throw createError({ statusCode: 400, statusMessage: `Duplicate location: ${name}` })
    }
    seenNames.add(key)
    locations.push({ name, latitude, longitude })
  }

  await saveKnownLocations(locations)
  return { success: true, count: locations.length }
})
