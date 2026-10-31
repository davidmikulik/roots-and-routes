// The history of the tree of the database of the request (level "edit"): saved changes, newest first. ?record=sources:S1
// keeps the entries that changed that record (history of a source).
import { requireDatabase } from '~~/server/utils/access'
import { listHistory } from '~~/server/utils/treeStore'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const { db } = await requireDatabase(event, 'edit')
  const query = getQuery(event)
  const record = typeof query.record === 'string' ? query.record : ''
  const limit = Math.min(Math.max(Number(query.limit) || 200, 1), 1000)
  const entries = (await listHistory(db)).filter(entry => !record || entry.records?.includes(record))
  return { entries: entries.slice(0, limit), total: entries.length }
})
