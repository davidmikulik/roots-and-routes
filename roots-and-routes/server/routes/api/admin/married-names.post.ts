// One-off: takes the names after marriage from the original GEDCOM (current.ged) into the current tree, see
// utils/gedcom/marriedNames.ts. { apply: false } only counts; { apply: true } backs the tree up first and saves it.
import { get } from '@vercel/blob'
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { getUploadDir, loadParsedGedcom, requireBlobToken, saveParsedGedcom } from '~~/server/utils/storage'
import { clampBackupCount, createBackup } from '~~/server/utils/backups'
import { parseGedcom } from '~~/utils/gedcom/parser'
import { takeMarriedNames } from '~~/utils/gedcom/marriedNames'

async function readOriginal(): Promise<string | null> {
  for (const extension of ['ged', 'gedcom']) {
    const blob = await get(`${getUploadDir()}/current.${extension}`, { access: 'private', token: requireBlobToken(), useCache: false })
    if (blob?.stream) return await new Response(blob.stream).text()
  }
  return null
}

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const body = await readBody<{ apply?: unknown; keep?: unknown }>(event)
  const apply = body?.apply === true

  const current = await loadParsedGedcom('current')
  if (!current) throw createError({ statusCode: 404, statusMessage: 'No family tree is saved' })
  const text = await readOriginal()
  if (!text) throw createError({ statusCode: 404, statusMessage: 'The original GEDCOM file is not stored' })
  const original = parseGedcom(text, { resolveXrefs: true, extractCoordinates: false }).file

  const result = takeMarriedNames(current, original, apply)
  let backupId: string | null = null
  if (apply && result.added) {
    backupId = await createBackup(clampBackupCount(body?.keep))
    await saveParsedGedcom(current, 'current')
  }
  console.log(`[GEDCOM] Married names from the original: ${result.added} ${apply ? 'added' : 'to add'}, ${result.mismatched} mismatched, ${result.alreadySet} already set`)
  return { success: true, applied: apply && result.added > 0, backupId, ...result }
})
