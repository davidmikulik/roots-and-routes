// Checks of the batch flow against a running server, on a TEST database (it saves and reverts changes there):
//
//   BASE=https://nase-koreny.mikulik.com TOKEN=<ADMIN_API_TOKEN or a session token> DB=<test database id> \
//     npx jiti scripts/check-batches.mts [person id]
//
// 1. a batch (new source, note and citation for the person) sent with dryRun: nothing is saved, the overview lists
//    the changes; 2. the same batch with a wrong baseRevision ends with 409; 3. applied; 4. a second batch with the
//    same (old) baseRevision ends with 409; 5. reverted in the history; the tree is then the same as before the batch
//    (except the revision). Never run it on the real tree: the history keeps both changes.
import { deserializeGedcomFile } from '../utils/gedcom/serialize'
import { RECORD_KINDS, stableStringify, type ChangeOp } from '../utils/gedcom/changes'
import type { GedcomFile } from '../types/gedcom'

const base = process.env.BASE || 'http://localhost:3000'
const token = process.env.TOKEN || ''
const db = process.env.DB || ''
if (!token || !db) {
  console.error('Set TOKEN (ADMIN_API_TOKEN or a session token; an access key cannot revert) and DB (the id of a test database).')
  process.exit(2)
}

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`)
}
const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer ${token}`, 'x-database': db, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json().catch(() => null) as any }
}
const load = async (): Promise<{ file: GedcomFile; revision: number }> => {
  const { json } = await call('GET', '/api/gedcom/get')
  if (!json?.data?.file) throw new Error('The test database has no tree')
  if (json.data.anonymized) throw new Error('The data are anonymized: the token has no permission to read the database')
  return { file: deserializeGedcomFile(json.data.file), revision: json.data.revision }
}
const snapshot = (file: GedcomFile) => stableStringify(RECORD_KINDS.map(kind => [...(file[kind] as Map<string, unknown>)]))

const before = await load()
const personId = process.argv[2] || before.file.individuals.keys().next().value!
console.log(`database ${db}, revision ${before.revision}, person ${personId}\n`)
const ops: ChangeOp[] = [
  { op: 'addSource', tempId: 'test', title: `Kontrola dávek ${new Date().toISOString()}`, repository: 'Testovací archiv', page: 'snímek 1' },
  { op: 'attachSource', source: 'test', person: personId, fact: 'person', confidence: 2 },
  { op: 'addNote', person: personId, text: 'Poznámka z kontroly dávek' },
]

let response = await call('POST', '/api/gedcom/changes', { dryRun: true, ops, title: 'Kontrola dávek' })
check('dryRun answers with an overview', response.status === 200 && response.json.preview?.length >= 2, JSON.stringify(response.json?.preview?.map((item: any) => item.label)))
check('dryRun saves nothing', (await load()).revision === before.revision)
response = await call('POST', '/api/gedcom/changes', { baseRevision: before.revision - 1, ops, title: 'Kontrola dávek' })
check('a wrong baseRevision is refused (409)', response.status === 409, String(response.status))
response = await call('POST', '/api/gedcom/changes', { baseRevision: before.revision, ops, title: 'Kontrola dávek' })
check('the batch is applied', response.status === 200 && response.json.revision === before.revision + 1, JSON.stringify(response.json).slice(0, 200))
const applied = response.json.revision as number
response = await call('POST', '/api/gedcom/changes', { baseRevision: before.revision, ops: [{ op: 'addNote', person: personId, text: 'x' }] })
check('a second batch with the same baseRevision is refused (409)', response.status === 409, String(response.status))
response = await call('POST', `/api/gedcom/history/${applied}/revert`, { baseRevision: applied })
check('the batch is reverted', response.status === 200, JSON.stringify(response.json).slice(0, 200))
const after = await load()
check('after the revert the tree is the same as before the batch', snapshot(after.file) === snapshot(before.file))

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
