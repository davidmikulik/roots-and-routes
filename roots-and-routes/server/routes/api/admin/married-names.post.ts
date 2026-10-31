// One-off: takes the names after marriage from the original GEDCOM (current.ged) into the current tree, see
// utils/gedcom/marriedNames.ts. { apply: false } only counts; { apply: true } backs the tree up first and saves it.
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { readOriginalGedcom } from '~~/server/utils/storage'
import { commitTree, loadTree } from '~~/server/utils/treeStore'
import { cloneTree } from '~~/utils/gedcom/changes'
import { clampBackupCount, createBackup } from '~~/server/utils/backups'
import { parseGedcom } from '~~/utils/gedcom/parser'
import { takeMarriedNames } from '~~/utils/gedcom/marriedNames'

export default defineEventHandler(async (event) => {
  const { db, actor } = await requireDatabase(event, 'admin')
  const paths = databasePaths(db)
  const body = await readBody<{ apply?: unknown; keep?: unknown }>(event)
  const apply = body?.apply === true

  const tree = await loadTree(db)
  if (!tree.file) throw createError({ statusCode: 404, statusMessage: 'No family tree is saved' })
  const text = await readOriginalGedcom(paths.original)
  if (!text) throw createError({ statusCode: 404, statusMessage: 'The original GEDCOM file is not stored' })
  const original = parseGedcom(text, { resolveXrefs: true, extractCoordinates: false }).file

  // A copy: the history keeps the people before and after
  const current = cloneTree(tree.file)
  const result = takeMarriedNames(current, original, apply)
  let backupId: string | null = null
  if (apply && result.added) {
    backupId = await createBackup(db, clampBackupCount(body?.keep))
    await commitTree(db, { base: tree, next: current, actor, title: 'Převzetí jmen po sňatku z původního GEDCOM', kind: 'edit' })
  }
  console.log(`[GEDCOM] Married names from the original: ${result.added} ${apply ? 'added' : 'to add'}, ${result.mismatched} mismatched, ${result.alreadySet} already set`)
  return { success: true, applied: apply && result.added > 0, backupId, ...result }
})
