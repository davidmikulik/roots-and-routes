// The tree of a database with its revision and history (docs/zdroje-a-bezpecne-ukladani-zadani.md, chapter 5).
//
// The parsed tree (<prefix>/parsed/current.json) carries the revision: an integer that grows with every saved change.
// Every write goes through commitTree: it writes the tree only if the blob is still the one that was read (ETag,
// ifMatch), so two writes at the same time cannot overwrite each other; the second one ends with 409. Each commit
// adds a history entry (<prefix>/history/<revision>.json: who, when, what, the changed records before and after) and
// a line in <prefix>/history/index.json. Reverting puts the "before" records back (POST /api/gedcom/history/<n>/revert).
// Backups of the whole tree (server/utils/backups.ts) stay as they were; the history adds to them.
import { BlobPreconditionFailedError, get, put } from '@vercel/blob'
import type { H3Event } from 'h3'
import type { GedcomFile } from '~~/types/gedcom'
import { parseGedcom } from '~~/utils/gedcom/parser'
import { deserializeGedcomFile, serializeGedcomFile, type SerializedGedcomFile } from '~~/utils/gedcom/serialize'
import { diffTrees, plainRecord, recordKey, type ChangeOp, type RecordChange } from '~~/utils/gedcom/changes'
import { formatPersonName } from '~~/utils/gedcom/names'
import type { DatabaseRecord } from '~~/server/utils/accounts'
import { databasePaths, type Actor } from '~~/server/utils/access'
import { readOriginalGedcom, requireBlobToken } from '~~/server/utils/storage'

export interface TreeState {
  file: GedcomFile | null
  revision: number
  // ETag of the parsed tree as it was read; the write is conditional on it
  etag?: string
}

export type HistoryKind = 'edit' | 'batch' | 'import' | 'restore' | 'revert'

export interface HistoryActor { id: string; username: string; token?: string }

export interface HistorySummary {
  revision: number
  at: string
  actor: HistoryActor
  title: string
  kind: HistoryKind
  // Changed records ("individuals:I12"); null = the whole tree (import, restore) or too many to list
  records: string[] | null
  counts: { added: number; changed: number; removed: number }
  revertible: boolean
  revertOf?: number
  revertedBy?: number
  // A batch proposed with an access key and approved in the app
  proposedBy?: HistoryActor
}

export interface HistoryEntry extends HistorySummary {
  changes: RecordChange[] | null
  ops?: ChangeOp[]
}

interface HistoryIndex { lastRevision: number; entries: HistorySummary[] }

// Above this many changed records the history keeps no copies (a merge of a whole file); the backups cover it
const MAX_RECORDED_CHANGES = 3000

const blobOptions = () => ({ access: 'private' as const, token: requireBlobToken() })
export const historyPaths = (db: DatabaseRecord) => {
  const { prefix } = databasePaths(db)
  return { dir: `${prefix}/history`, index: `${prefix}/history/index.json`, entry: (revision: number) => `${prefix}/history/${revision}.json`, pending: `${prefix}/pending` }
}

// The parsed tree may be from before the Map serialization fix (maps saved as {}): then the original is parsed again
const isCorrupted = (file: GedcomFile): boolean =>
  (file.metadata.totalIndividuals > 0 && file.individuals.size === 0) || (file.metadata.totalFamilies > 0 && file.families.size === 0)

export async function loadTree(db: DatabaseRecord): Promise<TreeState> {
  const paths = databasePaths(db)
  const blob = await get(paths.parsed, { ...blobOptions(), useCache: false })
  let file: GedcomFile | null = null
  let revision = 0
  const etag = blob?.blob?.etag
  if (blob?.stream) {
    try {
      const serialized = JSON.parse(await new Response(blob.stream).text()) as SerializedGedcomFile
      revision = Number(serialized.revision) || 0
      // Arrays are the current format; objects are the old one whose maps were lost
      if (!(serialized.individuals && typeof serialized.individuals === 'object' && !Array.isArray(serialized.individuals))) file = deserializeGedcomFile(serialized)
      else console.log(`[STORAGE] Old format of ${paths.parsed}, the original GEDCOM is parsed again`)
    } catch (error) {
      console.error('[STORAGE] The parsed tree cannot be read:', error)
    }
  }
  if (!file || isCorrupted(file)) {
    const original = await readOriginalGedcom(paths.original)
    if (original) file = parseGedcom(original, { resolveXrefs: true, extractCoordinates: true }).file
  }
  if (file) file.revision = revision
  return { file, revision, etag }
}

async function readJson<T>(path: string): Promise<{ value: T; etag?: string } | null> {
  const blob = await get(path, { ...blobOptions(), useCache: false })
  if (!blob?.stream) return null
  return { value: JSON.parse(await new Response(blob.stream).text()) as T, etag: blob.blob?.etag }
}

async function loadIndex(db: DatabaseRecord): Promise<{ index: HistoryIndex; etag?: string }> {
  const read = await readJson<HistoryIndex>(historyPaths(db).index)
  const value = read?.value
  return {
    index: { lastRevision: Number(value?.lastRevision) || 0, entries: Array.isArray(value?.entries) ? value!.entries : [] },
    etag: read?.etag,
  }
}

// Changes the index; another commit may write it at the same time, so it is read again until the write succeeds
async function updateIndex(db: DatabaseRecord, change: (index: HistoryIndex) => void): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { index, etag } = await loadIndex(db)
    change(index)
    try {
      await put(historyPaths(db).index, JSON.stringify(index), {
        ...blobOptions(), contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, ...(etag ? { ifMatch: etag } : {}),
      })
      return
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error
    }
  }
  throw createError({ statusCode: 503, statusMessage: 'The history could not be saved, try again' })
}

export async function listHistory(db: DatabaseRecord): Promise<HistorySummary[]> {
  return [...(await loadIndex(db)).index.entries].sort((a, b) => b.revision - a.revision)
}

export async function readHistoryEntry(db: DatabaseRecord, revision: number): Promise<HistoryEntry | null> {
  return (await readJson<HistoryEntry>(historyPaths(db).entry(revision)))?.value || null
}

// Records changed by the commits after `baseRevision`; null when that is not known (an import or a restore, or a
// revision without an entry), which means "anything could have changed"
export async function recordsChangedSince(db: DatabaseRecord, baseRevision: number, currentRevision: number): Promise<Set<string> | null> {
  if (baseRevision >= currentRevision) return new Set()
  const { index } = await loadIndex(db)
  const byRevision = new Map(index.entries.map(entry => [entry.revision, entry]))
  const changed = new Set<string>()
  for (let revision = baseRevision + 1; revision <= currentRevision; revision++) {
    const entry = byRevision.get(revision)
    if (!entry || !entry.records) return null
    for (const key of entry.records) changed.add(key)
  }
  return changed
}

export const historyActor = (actor: Actor | null): HistoryActor => ({
  id: actor?.id || 'unknown',
  username: actor?.username || '?',
  ...(actor?.apiToken ? { token: actor.apiToken.name } : {}),
})

// A readable name of a record key for conflict messages ("Jan Mikulík (I12)")
export const recordLabel = (file: GedcomFile | null, key: string): string => {
  const [kind, id] = key.split(':') as [string, string]
  if (kind === 'individuals') {
    const person = file?.individuals.get(id)
    return person ? `${formatPersonName(person.names) || '?'} (${id})` : id
  }
  if (kind === 'sources') return `${file?.sources.get(id)?.title || id} (${id})`
  return id
}

export const conflictError = (message: string, conflicts: { key: string; label: string }[] = []) =>
  createError({ statusCode: 409, statusMessage: 'Conflict', message, data: { conflicts } })

export interface CommitOptions {
  base: TreeState
  next: GedcomFile
  actor: Actor | null
  title: string
  kind: HistoryKind
  // The changed records; undefined = compared with the base tree, null = the whole tree (not revertible)
  changes?: RecordChange[] | null
  ops?: ChangeOp[]
  revertOf?: number
  proposedBy?: HistoryActor
  // Write even when the tree changed since it was read (import and restore replace it whole)
  force?: boolean
}

export async function commitTree(db: DatabaseRecord, options: CommitOptions): Promise<{ revision: number; changes: RecordChange[] | null }> {
  const { base, next } = options
  const computed = options.changes === undefined ? diffTrees(base.file, next) : options.changes
  const changes = computed && computed.length > MAX_RECORDED_CHANGES ? null : computed
  const { index } = await loadIndex(db)
  const revision = Math.max(base.revision, index.lastRevision) + 1
  next.revision = revision

  const paths = databasePaths(db)
  try {
    await put(paths.parsed, JSON.stringify(serializeGedcomFile(next)), {
      ...blobOptions(), contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
      ...(base.etag && !options.force ? { ifMatch: base.etag } : {}),
    })
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) throw conflictError('The tree was changed by someone else meanwhile. Load it again and repeat the change.')
    throw error
  }

  const counts = { added: 0, changed: 0, removed: 0 }
  for (const change of computed || []) {
    if (change.before === undefined) counts.added++
    else if (change.after === undefined) counts.removed++
    else counts.changed++
  }
  const summary: HistorySummary = {
    revision,
    at: new Date().toISOString(),
    actor: historyActor(options.actor),
    title: options.title.slice(0, 300),
    kind: options.kind,
    records: changes ? changes.map(change => recordKey(change.kind, change.id)) : null,
    counts,
    revertible: !!changes && changes.length > 0 && options.kind !== 'import' && options.kind !== 'restore',
    ...(options.revertOf ? { revertOf: options.revertOf } : {}),
    ...(options.proposedBy ? { proposedBy: options.proposedBy } : {}),
  }
  const entry: HistoryEntry = {
    ...summary,
    changes: changes ? changes.map(change => ({ kind: change.kind, id: change.id, before: plainRecord(change.before), after: plainRecord(change.after) })) : null,
    ...(options.ops ? { ops: options.ops } : {}),
  }
  try {
    await put(historyPaths(db).entry(revision), JSON.stringify(entry), { ...blobOptions(), contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
    await updateIndex(db, (current) => {
      current.lastRevision = Math.max(current.lastRevision, revision)
      current.entries = current.entries.filter(item => item.revision !== revision)
      current.entries.push(summary)
      if (options.revertOf) {
        const reverted = current.entries.find(item => item.revision === options.revertOf)
        if (reverted) reverted.revertedBy = revision
      }
    })
  } catch (error) {
    // The tree is saved; without the entry the change only cannot be reverted, and saves based on an older revision
    // are refused (recordsChangedSince does not know what changed)
    console.error(`[HISTORY] Entry ${revision} could not be saved:`, error)
  }
  console.log(`[HISTORY] ${db.id} revision ${revision} (${options.kind}): ${options.title} – ${counts.added} added, ${counts.changed} changed, ${counts.removed} removed`)
  return { revision, changes: computed }
}

// The language of the "was / will be" texts: ?lang= or the body's lang, otherwise Czech
export const langOf = (event: H3Event, body?: { lang?: unknown }): 'cs' | 'en' => (String(body?.lang || getQuery(event).lang || '') === 'en' ? 'en' : 'cs')
