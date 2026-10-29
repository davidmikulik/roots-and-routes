// A backup uploaded from the disk: the body is its GEDCOM text (from a .ged file, or gedcom.ged of a ZIP the browser
// unpacked). It becomes a new backup of the database of the request (level "edit", like making a backup); restoring
// it is a separate step. The answer lists the attachments the tree links to and where the browser uploads them
// (POST /api/admin/backups/media-token).
import { requireDatabase } from '~~/server/utils/access'
import { backupMediaDir, clampBackupCount, storeUploadedBackup, storedMediaOf } from '~~/server/utils/backups'
import { parseGedcom } from '~~/utils/gedcom/parser'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'edit')
  const text = (await readRawBody(event, 'utf8')) || ''
  if (!/^﻿?0\s+HEAD/.test(text.trimStart())) throw createError({ statusCode: 400, statusMessage: 'Not a GEDCOM file' })
  const file = parseGedcom(text, { resolveXrefs: true, extractCoordinates: false }).file
  if (file.individuals.size === 0) throw createError({ statusCode: 422, statusMessage: 'The file contains no people' })
  const id = await storeUploadedBackup(db, text, clampBackupCount(getQuery(event).keep))
  console.log(`[BACKUP] ${id} uploaded: ${file.individuals.size} people, ${storedMediaOf(file).length} attachments`)
  return { success: true, id, people: file.individuals.size, media: storedMediaOf(file), mediaDir: backupMediaDir(db, id) }
})
