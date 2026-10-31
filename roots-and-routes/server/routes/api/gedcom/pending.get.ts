// Batches waiting for approval in the database of the request: all of them for the level "edit", the own ones for a
// proposer's access key
import { requireEditOrProposer } from '~~/server/utils/access'
import { listPending } from '~~/server/utils/pendingChanges'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const { db, actor, proposer } = await requireEditOrProposer(event)
  const batches = await listPending(db)
  const visible = proposer ? batches.filter(batch => batch.createdBy.id === actor?.id && batch.createdBy.token === actor?.apiToken?.name) : batches
  return {
    batches: visible.map(batch => ({ id: batch.id, title: batch.title, createdAt: batch.createdAt, createdBy: batch.createdBy, baseRevision: batch.baseRevision, operations: batch.ops.length })),
  }
})
