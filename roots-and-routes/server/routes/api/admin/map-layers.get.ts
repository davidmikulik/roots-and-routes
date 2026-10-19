import { requireActor } from '~~/server/utils/access'
import { loadMapLayers } from '~~/server/utils/mapLayerStorage'

export default defineEventHandler(async (event) => {
  // Shared by all databases: every logged-in user with full data (not demo) sees them on the map
  await requireActor(event, 'read')
  return { layers: await loadMapLayers() }
})
