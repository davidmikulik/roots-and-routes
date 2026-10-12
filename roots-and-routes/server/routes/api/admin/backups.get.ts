import { requireAdminToken } from '~~/server/utils/adminAuth'
import { listBackups } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  return { backups: await listBackups() }
})
