import { requireActor } from '~~/server/utils/access'
import { loadKnownLocations } from '~~/server/utils/locationStorage'

export default defineEventHandler(async (event) => {
  // The catalog is shared by all databases; every logged-in user with full data (not demo) reads it
  await requireActor(event, 'read')
  return { locations: await loadKnownLocations() }
})
