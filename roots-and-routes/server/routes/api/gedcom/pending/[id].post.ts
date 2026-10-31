// Approving or rejecting a pending batch (level "edit"; never with an access key, see apiTokenScope.ts).
// { action: 'approve', baseRevision, ops?: number[] (only these operations), confirmOverwrite? } applies it to the tree
// as it is now (the revision the client saw the overview for must still hold) and removes it from the pending ones;
// { action: 'reject' } removes it.
import { requireDatabase } from '~~/server/utils/access'
import { applyChangeOps, ChangeError, diffTrees } from '~~/utils/gedcom/changes'
import { commitTree, conflictError, loadTree } from '~~/server/utils/treeStore'
import { deletePending, readPending } from '~~/server/utils/pendingChanges'

export default defineEventHandler(async (event) => {
  const { db, actor } = await requireDatabase(event, 'edit')
  const id = getRouterParam(event, 'id') || ''
  const body = await readBody<{ action?: unknown; baseRevision?: unknown; ops?: unknown; confirmOverwrite?: unknown }>(event)
  const batch = await readPending(db, id)
  if (!batch) throw createError({ statusCode: 404, statusMessage: 'The batch does not exist (it was approved or rejected)' })

  if (body?.action === 'reject') {
    await deletePending(db, id)
    console.log(`[CHANGES] ${db.id}: batch ${id} "${batch.title}" rejected by ${actor?.username}`)
    return { success: true, rejected: true }
  }
  if (body?.action !== 'approve') throw createError({ statusCode: 400, statusMessage: 'action must be approve or reject' })

  const tree = await loadTree(db)
  if (!tree.file) throw createError({ statusCode: 404, statusMessage: 'The database has no tree' })
  if (body.baseRevision !== tree.revision) throw conflictError('The tree changed since the overview was shown. Look at the changes again.')
  const selected = Array.isArray(body.ops) ? body.ops.filter((index): index is number => Number.isInteger(index) && !!batch.ops[index as number]) : []
  const ops = selected.length ? [...new Set(selected)].sort((a, b) => a - b).map(index => batch.ops[index]!) : batch.ops
  let result
  try {
    result = applyChangeOps(tree.file, ops)
  } catch (error) {
    if (error instanceof ChangeError) throw createError({ statusCode: 422, statusMessage: 'The batch cannot be applied', message: error.message, data: { errors: error.errors } })
    throw error
  }
  if (result.conflicts.length && body.confirmOverwrite !== true) {
    throw createError({ statusCode: 409, statusMessage: 'Overwrite not confirmed', message: 'The batch overwrites existing values; confirm it.', data: { overwrites: result.conflicts } })
  }
  const changes = diffTrees(tree.file, result.file)
  const title = ops.length < batch.ops.length ? `${batch.title} (${ops.length}/${batch.ops.length})` : batch.title
  const { revision } = changes.length
    ? await commitTree(db, { base: tree, next: result.file, actor, title, kind: 'batch', changes, ops, proposedBy: batch.createdBy })
    : { revision: tree.revision }
  await deletePending(db, id)
  console.log(`[CHANGES] ${db.id}: batch ${id} "${batch.title}" approved by ${actor?.username} (${ops.length} operations)`)
  return { success: true, revision, tempIds: result.tempIds }
})
