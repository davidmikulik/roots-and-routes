// One-off: takes the names after marriage from the original GEDCOM (current.ged) into the current tree, see
// utils/gedcom/marriedNames.ts. { apply: false } only counts; { apply: true } backs the tree up first and saves it.
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { loadParsedGedcom, readOriginalGedcom, saveParsedGedcom } from '~~/server/utils/storage'
import { clampBackupCount, createBackup } from '~~/server/utils/backups'
import { parseGedcom } from '~~/utils/gedcom/parser'
import { takeMarriedNames } from '~~/utils/gedcom/marriedNames'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'admin')
  const paths = databasePaths(db)
  const body = await readBody<{ apply?: unknown; keep?: unknown }>(event)
  const apply = body?.apply === true

  const current = await loadParsedGedcom(paths.parsed)
  if (!current) throw createError({ statusCode: 404, statusMessage: 'No family tree is saved' })
  const text = await readOriginalGedcom(paths.original)
  if (!text) throw createError({ statusCode: 404, statusMessage: 'The original GEDCOM file is not stored' })
  const original = parseGedcom(text, { resolveXrefs: true, extractCoordinates: false }).file

  const result = takeMarriedNames(current, original, apply)
  let backupId: string | null = null
  if (apply && result.added) {
    backupId = await createBackup(db, clampBackupCount(body?.keep))
    await saveParsedGedcom(current, paths.parsed)
  }
  console.log(`[GEDCOM] Married names from the original: ${result.added} ${apply ? 'added' : 'to add'}, ${result.mismatched} mismatched, ${result.alreadySet} already set`)
  return { success: true, applied: apply && result.added > 0, backupId, ...result }
})
