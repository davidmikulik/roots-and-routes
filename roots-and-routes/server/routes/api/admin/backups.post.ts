// Creates a backup of the current tree right now (used before a merge)
import { requireDatabase } from '~~/server/utils/access'
import { createBackup, clampBackupCount } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'edit')
  const body = await readBody<{ keep?: unknown }>(event)
  return { success: true, id: await createBackup(db, clampBackupCount(body?.keep)) }
})
