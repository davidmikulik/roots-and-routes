import { requireAdminToken } from '~~/server/utils/adminAuth'
import { loadKnownLocations } from '~~/server/utils/locationStorage'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  return { locations: await loadKnownLocations() }
})
