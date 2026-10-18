// Custom map layers in the private Blob store (uploads/gedcom/map-layers.json), see docs/vlastni-vrstvy-navrh.md.
// The first read moves the former uploaded sheets (overlays of the known locations) into one layer.
import { get, put } from '@vercel/blob'
import type { CustomLayer, MapSheet } from '~~/types/mapLayers'
import { MIGRATED_LAYER_ID, sanitizeCustomLayer, sanitizeSheet } from '~~/utils/map/mapLayers'
import { getUploadDir, requireBlobToken } from '~~/server/utils/storage'
import { loadKnownLocations } from '~~/server/utils/locationStorage'

const layersPath = (): string => `${getUploadDir()}/map-layers.json`

export async function saveMapLayers(layers: CustomLayer[]): Promise<void> {
  await put(layersPath(), JSON.stringify({ layers }, null, 2), {
    access: 'private',
    token: requireBlobToken(),
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

// Sheets the known locations carried before the layers existed
async function migrateOverlays(): Promise<CustomLayer[]> {
  const catalog = await loadKnownLocations()
  const sheets = catalog
    .flatMap(location => ((location as { overlays?: unknown }).overlays as unknown[] | undefined) || [])
    .map(sanitizeSheet)
    .filter((sheet): sheet is MapSheet => !!sheet)
    .filter((sheet, index, all) => all.findIndex(other => other.id === sheet.id) === index)
  const layers = sheets.length ? [{ id: MIGRATED_LAYER_ID, title: 'Vlastní nahrané listy', sheets }] : []
  // Saved even when empty, so the move never runs again
  await saveMapLayers(layers)
  console.log(`[STORAGE] Map layers created, ${sheets.length} uploaded sheets moved from the known locations`)
  return layers
}

export async function loadMapLayers(): Promise<CustomLayer[]> {
  // get() returns null only when the blob does not exist; any other failure throws, so nothing is overwritten
  const blob = await get(layersPath(), { access: 'private', token: requireBlobToken(), useCache: false })
  if (!blob?.stream) return await migrateOverlays()
  const content: unknown = JSON.parse(await new Response(blob.stream).text())
  const list = (content as { layers?: unknown })?.layers
  if (!Array.isArray(list)) return []
  return list.map(sanitizeCustomLayer).filter((layer): layer is CustomLayer => !!layer)
}
