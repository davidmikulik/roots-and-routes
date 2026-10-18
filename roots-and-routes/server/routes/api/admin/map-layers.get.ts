import { requireAdminToken } from '~~/server/utils/adminAuth'
import { loadMapLayers } from '~~/server/utils/mapLayerStorage'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  return { layers: await loadMapLayers() }
})
