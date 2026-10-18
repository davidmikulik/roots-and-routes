// Replaces the whole list of custom map layers (every change on Admin → Map layers is saved right away)
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { saveMapLayers } from '~~/server/utils/mapLayerStorage'
import { sanitizeCustomLayers } from '~~/utils/map/mapLayers'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const body = await readBody<{ layers?: unknown }>(event)
  const layers = sanitizeCustomLayers(body?.layers)
  if (!layers) throw createError({ statusCode: 400, statusMessage: 'Invalid map layers' })
  await saveMapLayers(layers)
  return { success: true, layers }
})
