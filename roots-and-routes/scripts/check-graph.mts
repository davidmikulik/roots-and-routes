// Checks of the data layer of the graphical tree (utils/gedcom/treeGraph.ts).
//
//   npx jiti scripts/check-graph.mts [get.json]
//
// Without an argument only the synthetic cases run. With the path of a saved response of GET /api/gedcom/get
// (for example `curl -H "Authorization: Bearer $ADMIN_API_TOKEN" https://nase-koreny.mikulik.com/api/gedcom/get -o get.json`;
// without the token the anonymized copy comes, which works too) every person is also used as the
// root of a layout and the result is checked: no exception, under 200 ms, no overlapping cards, parents above and
// children below, everyone who should be shown has a card, every parent-child pair is joined by connectors.
// Exit code 1 when a check fails.
import { readFileSync } from 'node:fs'
import { deserializeGedcomFile } from '../utils/gedcom/serialize'
import { buildTreeNodes, computeLayout, limitGenerations } from '../utils/gedcom/treeGraph'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`) }

const dataPath = process.argv[2]
const json = dataPath ? JSON.parse(readFileSync(dataPath, 'utf8')) : null

if (json) {
// ---------------------------------------------------------------- real data: every person as root
const file = deserializeGedcomFile(json.data.file)
const built = buildTreeNodes(file)
const byId = new Map(built.nodes.map(n => [n.id, n]))
console.log(`real data: ${built.nodes.length} nodes (${built.nodes.filter(n => n.id.startsWith('unknown-')).length} invented unknown partners), warnings=${built.warnings.length}, unknownSex=${built.unknownSex.size}\n`)

const closure = (start: string, next: (id: string) => string[]) => {
  const seen = new Set<string>(); const queue = [start]
  while (queue.length) { const id = queue.shift()!; for (const n of next(id)) if (!seen.has(n)) { seen.add(n); queue.push(n) } }
  return seen
}

let slowest = 0, slowestRoot = '', sizeMax = 0
const problems: Record<string, string[]> = { exception: [], overlap: [], orientation: [], missing: [], disconnected: [] }
let missingExamples: string[] = []
const sizes: number[] = []

for (const root of built.nodes.filter(n => !n.id.startsWith('unknown-'))) {
  let layout
  const t0 = performance.now()
  try { layout = computeLayout(built.nodes, root.id, 20) } catch (e: any) { problems.exception.push(`${root.id}: ${e.message}`); continue }
  const ms = performance.now() - t0
  if (ms > slowest) { slowest = ms; slowestRoot = root.id }
  const placed = new Map(layout.nodes.map(n => [n.id, n]))
  sizes.push(layout.nodes.length); sizeMax = Math.max(sizeMax, layout.nodes.length)

  // 1. no overlapping cells (a card occupies a 2 x 2 unit cell)
  const cells = layout.nodes
  let overlap = false
  for (let i = 0; i < cells.length && !overlap; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i]!, b = cells[j]!
    if (a.left < b.left + 2 && b.left < a.left + 2 && a.top < b.top + 2 && b.top < a.top + 2) { overlap = true; problems.overlap.push(`${root.id}: ${a.id}/${b.id}`); break }
  }

  // 3. orientation: parents above, children below, spouses and siblings in the same row
  const rootCell = placed.get(root.id)!
  const bad: string[] = []
  for (const p of byId.get(root.id)!.parents) { const c = placed.get(p.id); if (c && !(c.top < rootCell.top)) bad.push(`parent ${p.id}`) }
  for (const ch of byId.get(root.id)!.children) { const c = placed.get(ch.id); if (c && !(c.top > rootCell.top)) bad.push(`child ${ch.id}`) }
  for (const s of [...byId.get(root.id)!.spouses, ...byId.get(root.id)!.siblings]) { const c = placed.get(s.id); if (c && c.top !== rootCell.top) bad.push(`same-row ${s.id}`) }
  if (bad.length) problems.orientation.push(`${root.id}: ${bad.join(', ')}`)

  // 2. completeness: ancestors, descendants, siblings of the root, spouses of the root and of all descendants
  const ancestors = closure(root.id, id => byId.get(id)!.parents.map(r => r.id))
  const descendants = closure(root.id, id => byId.get(id)!.children.map(r => r.id))
  const expected = new Set<string>([root.id, ...ancestors, ...descendants])
  // The library shows the children of the root's parents as a couple; half siblings belong to another couple
  for (const r of byId.get(root.id)!.siblings) if (r.type === 'blood') expected.add(r.id)
  for (const id of [root.id, ...descendants]) for (const r of byId.get(id)!.spouses) expected.add(r.id)
  const missing = [...expected].filter(id => !placed.has(id))
  if (missing.length) { problems.missing.push(`${root.id}: ${missing.length}`); if (missingExamples.length < 3) missingExamples.push(`root ${root.id} missing ${missing.slice(0, 4).join(',')}`) }

  // 2b. every parent-child pair between placed people is joined by connectors (union-find over grid points)
  const parent = new Map<string, string>()
  const find = (k: string): string => { let r = k; while ((parent.get(r) ?? r) !== r) r = parent.get(r)!; parent.set(k, r); return r }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const [x1, y1, x2, y2] of layout.connectors) {
    // coordinates are multiples of 0.5: walk every segment in half-unit steps
    const steps = Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2)
    for (let s = 0; s < steps; s++) {
      const ax = x1 + Math.sign(x2 - x1) * s / 2, ay = y1 + Math.sign(y2 - y1) * s / 2
      const bx = x1 + Math.sign(x2 - x1) * (s + 1) / 2, by = y1 + Math.sign(y2 - y1) * (s + 1) / 2
      union(`${ax},${ay}`, `${bx},${by}`)
    }
  }
  const center = (id: string) => `${placed.get(id)!.left + 1},${placed.get(id)!.top + 1}`
  const broken: string[] = []
  for (const id of placed.keys()) for (const ch of byId.get(id)!.children) {
    if (placed.has(ch.id) && find(center(id)) !== find(center(ch.id))) broken.push(`${id}->${ch.id}`)
  }
  if (broken.length) problems.disconnected.push(`${root.id}: ${broken.slice(0, 3).join(' ')}`)
}

check('1. layout computes for all roots without exception', problems.exception.length === 0, problems.exception.slice(0, 3).join(' | '))
check(`1. slowest root takes under 200 ms`, slowest < 200, `${slowest.toFixed(1)} ms (${slowestRoot})`)
check('1. no overlapping cards for any root', problems.overlap.length === 0, problems.overlap.slice(0, 3).join(' | '))
check('3. parents above, children below, partners and siblings in the same row', problems.orientation.length === 0, problems.orientation.slice(0, 3).join(' | '))
check('2. every ancestor, descendant, sibling and spouse of the root has a card', problems.missing.length === 0, `${problems.missing.length} roots incomplete; ${missingExamples.join(' ; ')}`)
check('2. every parent-child pair is joined by connectors', problems.disconnected.length === 0, `${problems.disconnected.length} roots; ${problems.disconnected.slice(0, 3).join(' | ')}`)
console.log(`   cards per layout: max ${sizeMax}, average ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)}`)

// 4. edge cases of the real data
const twoMarriages = built.nodes.filter(n => n.spouses.length > 1)
let edgeOk = true; const edgeInfo: string[] = []
for (const n of twoMarriages) {
  const l = computeLayout(built.nodes, n.id, 20); const placed = new Map(l.nodes.map(c => [c.id, c]))
  const row = n.spouses.map(s => placed.get(s.id)).filter(Boolean)
  if (row.length !== n.spouses.length) { edgeOk = false; edgeInfo.push(`${n.id}: spouse missing`) }
  if (l.couples.filter(c => c.key.split('|').includes(n.id)).length !== n.spouses.length) { edgeOk = false; edgeInfo.push(`${n.id}: badge count`) }
  const apart = l.couples.filter(c => c.key.split('|').includes(n.id) && !c.adjacent).length
  if (apart) edgeInfo.push(`${n.id}: ${apart} partner(s) placed apart`)
}
check(`4. ${twoMarriages.length} people with two marriages: both partners shown, both couples get a badge`, edgeOk, edgeInfo.join(' | '))
const noWife = [...file.families.values()].filter(f => f.husband && !f.wife && f.children.length)
const noHusband = [...file.families.values()].filter(f => !f.husband && f.wife && f.children.length)
let singleOk = true
for (const f of [...noWife, ...noHusband]) {
  const parentId = (f.husband || f.wife)!; const l = computeLayout(built.nodes, f.children[0]!, 20); const placed = new Map(l.nodes.map(c => [c.id, c]))
  if (!placed.has(parentId)) singleOk = false
}
check(`4. ${noWife.length + noHusband.length} families with children and a single known parent render the parent`, singleOk)

}
else console.log('No data file given: only the synthetic cases run.\n')

// ---------------------------------------------------------------- 5. synthetic cases for buildTreeNodes
const person = (id: string, sex: 'M' | 'F' | '', extra: any = {}) => [id, { xrefId: id, names: [{ full: id, given: id, surname: '' }], sex, events: [], familiesAsChild: [], familiesAsSpouse: [], ...extra }] as const
const fam = (id: string, o: any) => [id, { xrefId: id, children: [], ...o }] as const
const mk = (people: any[], families: any[]) => ({ individuals: new Map(people), families: new Map(families) }) as any

{ // missing sex derived from role, fallback flagged
  const f = mk([person('h', ''), person('w', ''), person('lonely', ''), person('kid', 'M')], [fam('F1', { husband: 'h', wife: 'w', children: ['kid'] })])
  const b = buildTreeNodes(f); const g = (id: string) => b.nodes.find(n => n.id === id)!
  check('5. missing sex: husband -> male, wife -> female (not flagged)', g('h').gender === 'male' && g('w').gender === 'female' && !b.unknownSex.has('h') && !b.unknownSex.has('w'))
  check('5. missing sex without any role: male and flagged unknown', g('lonely').gender === 'male' && b.unknownSex.has('lonely'))
  check('5. person without relatives gets one card', computeLayout(b.nodes, 'lonely').nodes.length === 1)
}
{ // reference to a missing person
  const f = mk([person('h', 'M'), person('kid', 'F')], [fam('F1', { husband: 'h', wife: 'ghost', children: ['kid', 'ghost2'] })])
  const b = buildTreeNodes(f)
  const ids = JSON.stringify(b.nodes.flatMap(n => [...n.parents, ...n.children, ...n.siblings, ...n.spouses].map(r => r.id)))
  check('5. dangling references are dropped and layout still works', !ids.includes('ghost') && computeLayout(b.nodes, 'kid').nodes.length === 2)
}
{ // divorce + half siblings
  const f = mk([person('h', 'M'), person('w1', 'F'), person('w2', 'F'), person('k1', 'M'), person('k2', 'F')],
    [fam('F1', { husband: 'h', wife: 'w1', children: ['k1'], divorce: { type: 'DIV' } }), fam('F2', { husband: 'h', wife: 'w2', children: ['k2'] })])
  const b = buildTreeNodes(f); const g = (id: string) => b.nodes.find(n => n.id === id)!
  check('5. divorce: spouse relation typed divorced, the other married', g('h').spouses.find(s => s.id === 'w1')!.type === 'divorced' && g('h').spouses.find(s => s.id === 'w2')!.type === 'married')
  check('5. half siblings (one shared parent) typed half, both ways', g('k1').siblings.find(s => s.id === 'k2')?.type === 'half' && g('k2').siblings.find(s => s.id === 'k1')?.type === 'half')
  const l = computeLayout(b.nodes, 'k1'); check('5. layout with divorce and half sibling has no exception and shows all 5', l.nodes.length === 5, String(l.nodes.length))
}
{ // full siblings
  const f = mk([person('h', 'M'), person('w', 'F'), person('a', 'M'), person('b', 'F')], [fam('F1', { husband: 'h', wife: 'w', children: ['a', 'b'] })])
  const b = buildTreeNodes(f); check('5. full siblings typed blood', b.nodes.find(n => n.id === 'a')!.siblings[0]!.type === 'blood')
}
{ // cycle: a is own ancestor
  const f = mk([person('a', 'M'), person('b', 'F'), person('c', 'M')], [fam('F1', { husband: 'a', wife: 'b', children: ['c'] }), fam('F2', { husband: 'c', children: ['a'] })])
  const b = buildTreeNodes(f)
  let ok = true; try { computeLayout(b.nodes, 'a') } catch { ok = false }
  check('5. cyclic ancestry is broken with a warning and does not hang', ok && b.warnings.length >= 1, b.warnings.join('; '))
}
{ // limitGenerations
  const ppl = ['g1', 'g2', 'g3', 'g4'].map(id => person(id, 'M'))
  const f = mk(ppl, [fam('F1', { husband: 'g1', children: ['g2'] }), fam('F2', { husband: 'g2', children: ['g3'] }), fam('F3', { husband: 'g3', children: ['g4'] })])
  const b = buildTreeNodes(f)
  const all = computeLayout(b.nodes, 'g2', 10).nodes.length
  const cut = computeLayout(b.nodes, 'g2', 2).nodes.map(n => n.id).sort().join(',')
  check('5. maxGenerations leaves everything when nothing is beyond the limit', all === 4, String(all))
  check('5. maxGenerations=2 keeps only one generation up and down from the root', cut === 'g1,g2,g3', cut)
  check('5. limitGenerations returns the same array when nothing is cut', limitGenerations(b.nodes, 'g2', 10) === b.nodes)
}

{ // invented unknown partner
  const f = mk([person('P', 'M'), person('W', 'F'), person('A', 'M'), person('B', 'F'), person('Solo', 'F'), person('K', 'M')],
    [fam('F1', { husband: 'P', wife: 'W', children: ['A'] }), fam('F2', { husband: 'P', children: ['B'] }), fam('F3', { wife: 'Solo', children: ['K'] })])
  const b = buildTreeNodes(f); const g = (id: string) => b.nodes.find(n => n.id === id)!
  const u = b.nodes.find(n => n.id === 'unknown-F2')
  check('5. parent with two families gets an unknown partner for the single-parent family', !!u && u.gender === 'female' && g('B').parents.some(p => p.id === 'unknown-F2') && g('P').spouses.some(s => s.id === 'unknown-F2'))
  check('5. a lone single parent (one family only) gets no invented partner', !b.nodes.some(n => n.id === 'unknown-F3'))
  const l = computeLayout(b.nodes, 'P'); const ids = l.nodes.map(n => n.id)
  check('5. root with two partners shows both children and the unknown card', ids.includes('A') && ids.includes('B') && ids.includes('unknown-F2') && ids.includes('W'), ids.join(','))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
