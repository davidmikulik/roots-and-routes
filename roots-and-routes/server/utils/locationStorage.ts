import { put } from '@vercel/blob'
import type { KnownLocation } from '~~/types/locations'
import { getFileText, getBlobToken, getUploadDir } from '~~/server/utils/storage'

const locationsPath = (): string => `${getUploadDir()}/known-locations.json`

function isKnownLocation(value: unknown): value is KnownLocation {
  if (!value || typeof value !== 'object') return false
  const location = value as Partial<KnownLocation>
  const hasNoCoordinates = location.latitude === null && location.longitude === null
  const hasValidCoordinates = typeof location.latitude === 'number'
    && typeof location.longitude === 'number'
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)
    && Math.abs(location.latitude) <= 90
    && Math.abs(location.longitude) <= 180
  return typeof location.name === 'string' && location.name.trim().length > 0 && (hasNoCoordinates || hasValidCoordinates)
}

export async function loadKnownLocations(): Promise<KnownLocation[]> {
  try {
    const content = await getFileText(locationsPath())
    const locations: unknown = JSON.parse(content)
    if (!Array.isArray(locations)) return []
    return locations.filter(isKnownLocation)
  } catch {
    return []
  }
}

export async function saveKnownLocations(locations: KnownLocation[]): Promise<void> {
  const token = getBlobToken()
  if (!token) throw createError({ statusCode: 503, statusMessage: 'Blob storage is not configured' })
  await put(locationsPath(), JSON.stringify(locations, null, 2), {
    access: 'private',
    token,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export { isKnownLocation }
