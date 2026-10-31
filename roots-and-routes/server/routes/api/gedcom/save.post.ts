// Saves changes of the tree of the database of the request (level "edit"), with the revision check
// (docs/zdroje-a-bezpecne-ukladani-zadani.md, 5.1):
//
// - { baseRevision, changes: [{ kind, id, record | null }] } – only the changed records (people, families, sources…).
//   When the tree changed since baseRevision, the save goes through only if none of these records was changed
//   meanwhile; otherwise 409 with the records (people) that were. The answer says `merged: true` when other changes
//   happened meanwhile, the client then loads the tree again.
// - { baseRevision, fileData } – the whole tree; refused (409) whenever the tree changed since baseRevision.
//
// Every save is a history entry (who, when, the records before and after) that can be reverted.
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { deserializeGedcomFile, reviveDates, type SerializedGedcomFile } from '~~/utils/gedcom/serialize'
import { cloneTree, RECORD_KINDS, recordKey, stableStringify, type RecordChange, type RecordKind } from '~~/utils/gedcom/changes'
import { commitTree, conflictError, loadTree, recordLabel, recordsChangedSince } from '~~/server/utils/treeStore'
import type { GedcomFile } from '~~/types/gedcom'

interface DeltaRecord { kind?: unknown; id?: unknown; record?: unknown }

const emptyTree = (): GedcomFile => ({
  version: '5.5', encoding: 'UTF-8', source: 'Roots & Routes', date: new Date(),
  individuals: new Map(), families: new Map(), sources: new Map(), repositories: new Map(), multimedia: new Map(), notes: new Map(),
  metadata: { totalIndividuals: 0, totalFamilies: 0, totalSources: 0, totalRepositories: 0, totalMultimedia: 0, totalNotes: 0, totalGenerations: 0 },
})

export default defineEventHandler(async (event) => {
  const { db, actor } = await requireDatabase(event, 'edit')
  const body = await readBody<{ baseRevision?: unknown; fileData?: SerializedGedcomFile; changes?: DeltaRecord[]; title?: unknown }>(event)
  const baseRevision = typeof body?.baseRevision === 'number' && Number.isInteger(body.baseRevision) ? body.baseRevision : null
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Úprava v aplikaci'
  const tree = await loadTree(db)

  if (Array.isArray(body?.changes)) {
    if (baseRevision === null) throw createError({ statusCode: 400, statusMessage: 'baseRevision is required' })
    const delta: { kind: RecordKind; id: string; record: unknown }[] = []
    for (const item of body.changes) {
      const kind = item?.kind as RecordKind
      const id = typeof item?.id === 'string' ? item.id.trim() : ''
      const record = item?.record ?? null
      if (!RECORD_KINDS.includes(kind) || !id) throw createError({ statusCode: 400, statusMessage: 'Invalid change' })
      if (record !== null && (typeof record !== 'object' || (record as { xrefId?: unknown }).xrefId !== id)) throw createError({ statusCode: 400, statusMessage: `Invalid record ${kind}:${id}` })
      delta.push({ kind, id, record })
    }
    // Records changed by somebody else since the client loaded the tree
    if (baseRevision !== tree.revision) {
      const changed = await recordsChangedSince(db, baseRevision, tree.revision)
      const overlap = changed ? delta.map(item => recordKey(item.kind, item.id)).filter(key => changed.has(key)) : delta.map(item => recordKey(item.kind, item.id))
      if (overlap.length) {
        const conflicts = overlap.slice(0, 20).map(key => ({ key, label: recordLabel(tree.file, key) }))
        throw conflictError(`Someone else changed the same records meanwhile: ${conflicts.map(item => item.label).join(', ')}`, conflicts)
      }
    }
    const next = tree.file ? cloneTree(tree.file) : emptyTree()
    const changes: RecordChange[] = []
    for (const item of delta) {
      const map = next[item.kind] as Map<string, unknown>
      const before = map.get(item.id)
      const after = item.record === null ? undefined : reviveDates(item.record)
      if (stableStringify(before) === stableStringify(after)) continue
      if (after === undefined) map.delete(item.id)
      else map.set(item.id, after)
      changes.push({ kind: item.kind, id: item.id, before, after })
    }
    if (!changes.length) return { success: true, revision: tree.revision, unchanged: true }
    next.metadata = {
      ...next.metadata,
      totalIndividuals: next.individuals.size,
      totalFamilies: next.families.size,
      totalSources: next.sources.size,
      totalRepositories: next.repositories.size,
      totalMultimedia: next.multimedia.size,
      totalNotes: next.notes.size,
    }
    const { revision } = await commitTree(db, { base: tree, next, actor, title, kind: 'edit', changes })
    return { success: true, revision, merged: baseRevision !== tree.revision, data: { fileId: 'current', databaseId: db.id } }
  }

  if (!body?.fileData) throw createError({ statusCode: 400, statusMessage: 'fileData or changes is required' })
  // The whole tree replaces the saved one only when nothing changed since the client loaded it
  if (tree.file && baseRevision !== tree.revision) {
    throw conflictError(baseRevision === null
      ? 'The revision of the tree is missing (baseRevision). Load the tree again.'
      : 'The tree was changed by someone else meanwhile. Load it again and repeat the change.')
  }
  const next = deserializeGedcomFile(body.fileData)
  const { revision } = await commitTree(db, { base: tree, next, actor, title, kind: 'edit' })
  console.log(`[GEDCOM] Saved the whole tree of ${db.id} (${databasePaths(db).parsed}), revision ${revision}`)
  return { success: true, revision, merged: false, data: { fileId: 'current', databaseId: db.id } }
})
