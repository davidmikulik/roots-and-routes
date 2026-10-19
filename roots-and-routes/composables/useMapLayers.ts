// Custom historical map layers (Admin → Map layers) on the client, see docs/vlastni-vrstvy-navrh.md. Shared by all
// databases: logged-in users with full data see them, administrators change them; the list and the images need the
// session token. Loaded once and shared through useState; every change is
// saved right away (PUT /api/admin/map-layers replaces the whole list).
import type { CustomLayer, MapSheet } from '~~/types/mapLayers'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { sanitizeCustomLayers } from '~~/utils/map/mapLayers'

// Blob URLs of sheet images already fetched (with the admin token), kept for the whole session so a sheet is
// fetched once whether it is shown on the map or opened in the editor
const imageUrlCache = new Map<string, string>()

export const useMapLayers = () => {
  const adminAuth = useAdminAuth()
  const layers = useState<CustomLayer[] | null>('map-layers', () => null)

  const load = async (force = false): Promise<void> => {
    if (!import.meta.client || !adminAuth.canRead.value || (layers.value && !force)) return
    try {
      layers.value = (await $fetch<{ layers: CustomLayer[] }>('/api/admin/map-layers', { headers: adminAuth.authHeaders() })).layers
    } catch (error) {
      console.error('[MAP LAYERS] Map layers could not be loaded:', error)
    }
  }

  // Pages call this in setup: loads as soon as the session is known (it is restored after the page mounted)
  const autoLoad = () => watch(() => adminAuth.canRead.value, (canRead) => {
    if (canRead) void load()
    else layers.value = null
  }, { immediate: true })

  // Saves the whole list; the shared state takes the server's cleaned copy only after the save succeeded
  const save = async (list: CustomLayer[]): Promise<void> => {
    adminAuth.requireSystemAdmin()
    const clean = sanitizeCustomLayers(list)
    if (!clean) throw new Error('Invalid map layers')
    const response = await $fetch<{ layers: CustomLayer[] }>('/api/admin/map-layers', {
      method: 'PUT',
      headers: adminAuth.authHeaders(),
      body: { layers: clean },
    })
    layers.value = response.layers
  }

  // Uploads a scanned sheet (a bought copy) straight to the Blob store via a short-lived token, and reads its pixel
  // size. Big files cannot go through a Vercel function, hence the client upload.
  const uploadImage = async (file: File): Promise<{ file: string; width: number; height: number }> => {
    adminAuth.requireSystemAdmin()
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
      // server/middleware/loginForWrites.ts needs the token on every POST, including this token request
      headers: adminAuth.authHeaders(),
      contentType: file.type || 'image/jpeg',
      multipart: file.size > 8 * 1024 * 1024,
    })
    return { file: name, width, height }
  }

  // A blob: URL for a sheet image (fetched once with the session token from the shared folder of the layers, not the
  // attachments of a database); the caller must not revoke it
  const imageUrl = async (file: string): Promise<string> => {
    const cached = imageUrlCache.get(file)
    if (cached) return cached
    const blob = await $fetch<Blob>(`/api/${file}?scope=layers`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    imageUrlCache.set(file, url)
    return url
  }

  // Sheets of a layer with their image resolved, for drawing on the map
  const resolveSheets = (layer: CustomLayer): Promise<(MapSheet & { url: string })[]> =>
    Promise.all(layer.sheets.map(async sheet => ({ ...sheet, url: await imageUrl(sheet.file) })))

  return { layers, load, autoLoad, save, uploadImage, imageUrl, resolveSheets }
}
