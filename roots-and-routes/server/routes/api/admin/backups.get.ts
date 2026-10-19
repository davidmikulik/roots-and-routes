import { requireDatabase } from '~~/server/utils/access'
import { listBackups } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  // Backups of the database of the request; whoever edits it may back it up (before a merge)
  const { db } = await requireDatabase(event, 'edit')
  return { backups: await listBackups(db) }
})
