// Lets the UI check an admin token before unlocking editing
import { requireAdminToken } from '~~/server/utils/adminAuth'

export default defineEventHandler((event) => {
  requireAdminToken(event)
  return { success: true }
})
