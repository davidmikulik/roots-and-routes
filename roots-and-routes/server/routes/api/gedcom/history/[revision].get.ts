// One history entry with its overview (was / will be) and whether it can be reverted now (level "edit")
import { requireDatabase } from '~~/server/utils/access'
import { changedSince, describeChanges } from '~~/utils/gedcom/changes'
import { langOf, loadTree, readHistoryEntry } from '~~/server/utils/treeStore'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const { db } = await requireDatabase(event, 'edit')
  const revision = Number(getRouterParam(event, 'revision'))
  const entry = Number.isInteger(revision) ? await readHistoryEntry(db, revision) : null
  if (!entry) throw createError({ statusCode: 404, statusMessage: 'No such history entry' })
  const tree = await loadTree(db)
  const changes = entry.changes || []
  // Records changed again later: reverting would undo those changes too, so it is refused
  const blocked = tree.file && entry.changes ? changedSince(tree.file, changes, 'after').map(change => `${change.kind}:${change.id}`) : []
  const { changes: _changes, ops: _ops, ...summary } = entry
  return {
    entry: summary,
    revision: tree.revision,
    preview: describeChanges(changes, tree.file ? [tree.file] : [], langOf(event)),
    canRevert: entry.revertible && !entry.revertedBy && !blocked.length,
    blocked,
  }
})
