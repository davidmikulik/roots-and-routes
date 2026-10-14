// Replaces the current tree with a backup. The tree being replaced is backed up first, so a restore can be undone.
// Attachments that are missing in media/ are copied back from the backup.
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { createBackup, readBackup, clampBackupCount, restoreBackupMedia } from '~~/server/utils/backups'
import { uploadGedcomFile, saveParsedGedcom } from '~~/server/utils/storage'
import { parseGedcom } from '~~/utils/gedcom/parser'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const body = await readBody<{ id?: unknown; keep?: unknown }>(event)
  if (typeof body?.id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Backup id is required' })

  const content = await readBackup(body.id)
  const parsed = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
  if (parsed.file.individuals.size === 0) throw createError({ statusCode: 422, statusMessage: 'The backup contains no people' })

  await createBackup(clampBackupCount(body.keep))
  await uploadGedcomFile(content, 'current.ged', { overwrite: true, fileId: 'current' })
  await saveParsedGedcom(parsed.file, 'current')
  const attachments = await restoreBackupMedia(body.id, parsed.file)
  return { success: true, people: parsed.file.individuals.size, families: parsed.file.families.size, attachments }
})
