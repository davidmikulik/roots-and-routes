// Creates a backup of the current tree right now (used before a merge)
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { createBackup, clampBackupCount } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const body = await readBody<{ keep?: unknown }>(event)
  return { success: true, id: await createBackup(clampBackupCount(body?.keep)) }
})
