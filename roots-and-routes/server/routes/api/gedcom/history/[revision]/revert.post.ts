// Reverts a history entry (level "edit", { baseRevision }): the records go back to how they were before it. Refused
// (409) when the tree is not at baseRevision or when one of the records was changed again since (that change would be
// lost). The revert is a new history entry, so it can be reverted too.
import { requireDatabase } from '~~/server/utils/access'
import { applyRecordChanges, changedSince, cloneTree, recordKey } from '~~/utils/gedcom/changes'
import { commitTree, conflictError, loadTree, readHistoryEntry, recordLabel } from '~~/server/utils/treeStore'

export default defineEventHandler(async (event) => {
  const { db, actor } = await requireDatabase(event, 'edit')
  const revision = Number(getRouterParam(event, 'revision'))
  const body = await readBody<{ baseRevision?: unknown }>(event)
  const entry = Number.isInteger(revision) ? await readHistoryEntry(db, revision) : null
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'No such history entry' })
  if (!entry.revertible || !entry.changes?.length) throw createError({ statusCode: 422, statusMessage: 'This change cannot be reverted (use a backup)' })
  if (entry.revertedBy) throw createError({ statusCode: 422, statusMessage: `Already reverted (revision ${entry.revertedBy})` })
  const tree = await loadTree(db)
  if (!tree.file) throw createError({ statusCode: 404, statusMessage: 'The database has no tree' })
  if (body?.baseRevision !== tree.revision) throw conflictError('The tree changed meanwhile. Load the history again.')
  const blocked = changedSince(tree.file, entry.changes, 'after')
  if (blocked.length) {
    const conflicts = blocked.slice(0, 20).map(change => ({ key: recordKey(change.kind, change.id), label: recordLabel(tree.file, recordKey(change.kind, change.id)) }))
    throw conflictError(`These records were changed again later: ${conflicts.map(item => item.label).join(', ')}`, conflicts)
  }
  const next = cloneTree(tree.file)
  applyRecordChanges(next, entry.changes, 'before')
  const changes = entry.changes.map(change => ({ kind: change.kind, id: change.id, before: change.after, after: change.before }))
  const result = await commitTree(db, { base: tree, next, actor, title: `Vrácení: ${entry.title}`, kind: 'revert', changes, revertOf: entry.revision })
  return { success: true, revision: result.revision }
})
