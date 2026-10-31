// A batch of changes (docs/zdroje-a-bezpecne-ukladani-zadani.md, 5.2): addSource, setFact, createPerson… applied all
// or nothing (utils/gedcom/changes.ts).
//
// { baseRevision?, title, ops, dryRun?, confirmOverwrite?, lang? }
// - dryRun: nothing is saved; the answer is the overview of the changes (was / will be), the overwritten values and
//   the ids the new records would get.
// - a user with the level "edit" (or an editor's access key) saves the batch right away: the tree must still be at
//   baseRevision (409 otherwise), overwriting a value needs confirmOverwrite or "overwrite" on the operation (409).
// - a proposer's access key stores the batch as pending; it is applied only when somebody approves it in the app.
import { requireEditOrProposer } from '~~/server/utils/access'
import { applyChangeOps, ChangeError, describeChanges, describeOp, diffTrees } from '~~/utils/gedcom/changes'
import { commitTree, conflictError, historyActor, langOf, loadTree } from '~~/server/utils/treeStore'
import { readOps, savePending } from '~~/server/utils/pendingChanges'

export default defineEventHandler(async (event) => {
  const { db, actor, proposer } = await requireEditOrProposer(event)
  const body = await readBody<{ baseRevision?: unknown; title?: unknown; ops?: unknown; dryRun?: unknown; confirmOverwrite?: unknown; lang?: unknown }>(event)
  const ops = readOps(body?.ops)
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 300) : 'Dávka změn'
  const baseRevision = typeof body?.baseRevision === 'number' ? body.baseRevision : null
  const dryRun = body?.dryRun === true
  const lang = langOf(event, body)
  const tree = await loadTree(db)
  if (!tree.file) throw createError({ statusCode: 404, statusMessage: 'The database has no tree yet' })

  let result
  try {
    result = applyChangeOps(tree.file, ops, { confirmOverwrite: body?.confirmOverwrite === true })
  } catch (error) {
    if (error instanceof ChangeError) throw createError({ statusCode: 422, statusMessage: 'The batch cannot be applied', message: error.message, data: { errors: error.errors } })
    throw error
  }
  // Overwriting is confirmed for the whole batch or by the operation itself
  const unconfirmed = body?.confirmOverwrite === true ? [] : result.conflicts.filter(conflict => (ops[conflict.op - 1] as { overwrite?: boolean }).overwrite !== true)
  const changes = diffTrees(tree.file, result.file)
  const overview = {
    revision: tree.revision,
    stale: baseRevision !== null && baseRevision !== tree.revision,
    tempIds: result.tempIds,
    overwrites: result.conflicts,
    unconfirmed,
    operations: ops.map(op => describeOp(op, result.file, lang)),
    preview: describeChanges(changes, [result.file, tree.file], lang),
  }
  if (dryRun) return { success: true, dryRun: true, ...overview }

  if (proposer) {
    const pending = await savePending(db, { title, createdBy: historyActor(actor), baseRevision: tree.revision, ops })
    console.log(`[CHANGES] ${db.id}: pending batch ${pending.id} "${title}" (${ops.length} operations) from key ${actor?.apiToken?.name}`)
    return { success: true, pending: true, id: pending.id, ...overview }
  }
  if (baseRevision === null) throw createError({ statusCode: 400, statusMessage: 'baseRevision is required (or dryRun)' })
  if (baseRevision !== tree.revision) throw conflictError(`The tree is at revision ${tree.revision}, the batch was prepared for ${baseRevision}. Run it again with dryRun.`)
  if (unconfirmed.length) throw createError({ statusCode: 409, statusMessage: 'Overwrite not confirmed', message: 'The batch overwrites existing values; confirm it with confirmOverwrite.', data: { overwrites: unconfirmed } })
  if (!changes.length) return { success: true, unchanged: true, ...overview }
  const { revision } = await commitTree(db, { base: tree, next: result.file, actor, title, kind: 'batch', changes, ops })
  return { success: true, ...overview, revision }
})
