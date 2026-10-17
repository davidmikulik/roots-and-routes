// The catalog of known locations (Admin → Known locations) on the client, for showing the archive maps of a place.
// Only for the administrator: GET /api/admin/locations needs the admin token. Loaded once and shared through useState;
// the Known locations page puts its list here after loading, saving or syncing.
import type { KnownLocation, MapOverlay } from '~~/types/locations'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { normalizeLocationName } from '~~/utils/gedcom/locations'
import { parseArchiveMapUrl, type ParsedArchiveMap } from '~~/utils/gedcom/archiveMaps'

// Blob URLs of overlay images already fetched (with the admin token), kept for the whole session so a sheet is
// fetched once whether it is shown on the map or opened in the editor
const overlayUrlCache = new Map<string, string>()

export const useKnownLocations = () => {
  const adminAuth = useAdminAuth()
  const locations = useState<KnownLocation[] | null>('known-locations', () => null)

  const load = async (force = false): Promise<void> => {
    if (!import.meta.client || !adminAuth.isAdmin.value || (locations.value && !force)) return
    try {
      locations.value = (await $fetch<{ locations: KnownLocation[] }>('/api/admin/locations', { headers: adminAuth.authHeaders() })).locations
    } catch (error) {
      console.error('[LOCATIONS] Known locations could not be loaded:', error)
    }
  }

  // Pages call this in setup: loads as soon as the admin token is known (it is restored after the page mounted)
  const autoLoad = () => watch(() => adminAuth.isAdmin.value, (isAdmin) => {
    if (isAdmin) void load()
    else locations.value = null
  }, { immediate: true })

  const set = (list: KnownLocation[]) => {
    locations.value = list.map(location => ({
      ...location,
      archiveMaps: location.archiveMaps?.map(map => ({ ...map })),
      overlays: location.overlays?.map(overlay => ({ ...overlay, points: overlay.points.map(p => ({ ...p })) })),
    }))
  }

  const byName = computed(() => new Map((locations.value || []).map(location => [normalizeLocationName(location.name), location])))

  // Archive map sheets of a place (empty for visitors, places without links and unknown places)
  const archiveMapsFor = (place?: string): ParsedArchiveMap[] => {
    if (!place) return []
    return (byName.value.get(normalizeLocationName(place))?.archiveMaps || [])
      .map(map => parseArchiveMapUrl(map.url))
      .filter((map): map is ParsedArchiveMap => !!map)
  }

  // Uploads a scanned sheet (a bought copy) straight to the Blob store via a short-lived token, and reads its pixel
  // size. Big files cannot go through a Vercel function, hence the client upload.
  const uploadOverlay = async (file: File): Promise<{ file: string; width: number; height: number }> => {
    adminAuth.requireAdmin()
    const bitmap = await createImageBitmap(file)
    const width = bitmap.width
    const height = bitmap.height
    bitmap.close?.()
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const name = `media/${crypto.randomUUID()}.${ext}`
    const { upload } = await import('@vercel/blob/client')
    await upload(`uploads/gedcom/${name}`, file, {
      access: 'private',
      handleUploadUrl: '/api/media/overlay-token',
      clientPayload: adminAuth.token.value,
      contentType: file.type || 'image/jpeg',
      multipart: file.size > 8 * 1024 * 1024,
    })
    return { file: name, width, height }
  }

  // A blob: URL for an overlay image (fetched once with the admin token); the caller must not revoke it
  const overlayImageUrl = async (file: string): Promise<string> => {
    const cached = overlayUrlCache.get(file)
    if (cached) return cached
    const blob = await $fetch<Blob>(`/api/${file}`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    overlayUrlCache.set(file, url)
    return url
  }

  // Overlays of a place with their image resolved, for drawing on the map (empty for visitors and unknown places)
  const overlaysFor = async (place?: string): Promise<(MapOverlay & { url: string })[]> => {
    if (!place) return []
    const overlays = byName.value.get(normalizeLocationName(place))?.overlays || []
    return Promise.all(overlays.map(async overlay => ({ ...overlay, url: await overlayImageUrl(overlay.file) })))
  }

  return { locations, load, autoLoad, set, archiveMapsFor, uploadOverlay, overlayImageUrl, overlaysFor }
}
