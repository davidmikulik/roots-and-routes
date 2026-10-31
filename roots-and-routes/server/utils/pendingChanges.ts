// Batches of changes waiting for approval (<prefix>/pending/<id>.json): sent with a proposer's access key, approved or
// rejected in the app (page Pending changes, level "edit"). Approving applies the batch to the tree as it is then.
import { randomUUID } from 'node:crypto'
import { del, get, put } from '@vercel/blob'
import type { DatabaseRecord } from '~~/server/utils/accounts'
import { listAllBlobs, requireBlobToken } from '~~/server/utils/storage'
import { historyPaths, type HistoryActor } from '~~/server/utils/treeStore'
import { CHANGE_OPS, type ChangeOp } from '~~/utils/gedcom/changes'

export interface PendingBatch {
  id: string
  title: string
  createdAt: string
  createdBy: HistoryActor
  // The revision the batch was prepared for (the tree may be newer when it is approved)
  baseRevision: number
  ops: ChangeOp[]
}

export const MAX_OPS = 500

const pendingPath = (db: DatabaseRecord, id: string) => `${historyPaths(db).pending}/${id}.json`
const isPendingId = (id: string) => /^[0-9a-f-]{36}$/.test(id)

// The operations of a request: a list of objects with a known "op" (the details are checked when they are applied)
export function readOps(value: unknown): ChangeOp[] {
  if (!Array.isArray(value) || !value.length) throw createError({ statusCode: 400, statusMessage: 'ops must be a non-empty list' })
  if (value.length > MAX_OPS) throw createError({ statusCode: 413, statusMessage: `At most ${MAX_OPS} operations in one batch` })
  for (const [index, op] of value.entries()) {
    if (!op || typeof op !== 'object' || !CHANGE_OPS.includes((op as { op?: unknown }).op as typeof CHANGE_OPS[number])) {
      throw createError({ statusCode: 400, statusMessage: `op ${index + 1}: unknown operation` })
    }
  }
  return value as ChangeOp[]
}

export async function savePending(db: DatabaseRecord, batch: Omit<PendingBatch, 'id' | 'createdAt'>): Promise<PendingBatch> {
  const pending: PendingBatch = { ...batch, id: randomUUID(), createdAt: new Date().toISOString() }
  await put(pendingPath(db, pending.id), JSON.stringify(pending), { access: 'private', token: requireBlobToken(), contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false })
  return pending
}

export async function readPending(db: DatabaseRecord, id: string): Promise<PendingBatch | null> {
  if (!isPendingId(id)) return null
  const blob = await get(pendingPath(db, id), { access: 'private', token: requireBlobToken(), useCache: false })
  return blob?.stream ? JSON.parse(await new Response(blob.stream).text()) as PendingBatch : null
}

export async function listPending(db: DatabaseRecord): Promise<PendingBatch[]> {
  const blobs = (await listAllBlobs(`${historyPaths(db).pending}/`)).filter(blob => blob.pathname.endsWith('.json'))
  const batches = await Promise.all(blobs.slice(0, 200).map(blob => readPending(db, blob.pathname.split('/').pop()!.replace(/\.json$/, '')).catch(() => null)))
  return batches.filter((batch): batch is PendingBatch => !!batch).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function deletePending(db: DatabaseRecord, id: string): Promise<void> {
  if (isPendingId(id)) await del(pendingPath(db, id), { token: requireBlobToken() })
}
