// Replaces the current tree with a backup. The tree being replaced is backed up first, so a restore can be undone.
// Attachments that are missing in media/ are copied back from the backup.
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { createBackup, readBackup, clampBackupCount, restoreBackupMedia } from '~~/server/utils/backups'
import { saveOriginalGedcom, saveParsedGedcom } from '~~/server/utils/storage'
import { parseGedcom } from '~~/utils/gedcom/parser'

export default defineEventHandler(async (event) => {
  // Replacing the tree of the database needs the permission to administer it
  const { db } = await requireDatabase(event, 'admin')
  const body = await readBody<{ id?: unknown; keep?: unknown }>(event)
  if (typeof body?.id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Backup id is required' })

  const content = await readBackup(db, body.id)
  const parsed = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
  if (parsed.file.individuals.size === 0) throw createError({ statusCode: 422, statusMessage: 'The backup contains no people' })

  const paths = databasePaths(db)
  await createBackup(db, clampBackupCount(body.keep))
  await saveOriginalGedcom(paths.original, content)
  await saveParsedGedcom(parsed.file, paths.parsed)
  const attachments = await restoreBackupMedia(db, body.id, parsed.file)
  return { success: true, people: parsed.file.individuals.size, families: parsed.file.families.size, attachments }
})
