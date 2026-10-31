// One pending batch with its overview against the tree as it is now (was / will be, overwritten values, errors when
// it cannot be applied any more). Level "edit".
import { requireDatabase } from '~~/server/utils/access'
import { applyChangeOps, ChangeError, describeChanges, describeOp, diffTrees } from '~~/utils/gedcom/changes'
import { langOf, loadTree } from '~~/server/utils/treeStore'
import { readPending } from '~~/server/utils/pendingChanges'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const { db } = await requireDatabase(event, 'edit')
  const batch = await readPending(db, getRouterParam(event, 'id') || '')
  if (!batch) throw createError({ statusCode: 404, statusMessage: 'The batch does not exist (it was approved or rejected)' })
  const lang = langOf(event)
  const tree = await loadTree(db)
  if (!tree.file) throw createError({ statusCode: 404, statusMessage: 'The database has no tree' })
  // Only some operations: ?ops=0,2,3
  const selected = String(getQuery(event).ops || '').split(',').filter(Boolean).map(Number).filter(index => Number.isInteger(index) && batch.ops[index])
  const ops = selected.length ? selected.map(index => batch.ops[index]!) : batch.ops
  let operations = batch.ops.map(op => describeOp(op, tree.file!, lang))
  try {
    const result = applyChangeOps(tree.file, ops)
    // With the new records, so the operations can name them (a new source instead of its tempId)
    const all = selected.length ? (() => { try { return applyChangeOps(tree.file!, batch.ops) } catch { return result } })() : result
    operations = batch.ops.map(op => describeOp(op, all.file, lang, all.tempIds))
    return {
      batch: { ...batch, ops: undefined, operations },
      revision: tree.revision,
      overwrites: result.conflicts,
      preview: describeChanges(diffTrees(tree.file, result.file), [result.file, tree.file], lang),
      errors: [],
    }
  } catch (error) {
    if (!(error instanceof ChangeError)) throw error
    return { batch: { ...batch, ops: undefined, operations }, revision: tree.revision, overwrites: [], preview: [], errors: error.errors }
  }
})
