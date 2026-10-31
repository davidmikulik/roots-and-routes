// Checks of source records and batches of changes (utils/gedcom/sources.ts, utils/gedcom/changes.ts).
//
//   npm run check:sources [-- get.json]
//
// Without an argument only the synthetic cases run: GEDCOM round trip (read → write → read keeps sources, archives,
// citations with page, confidence and text, participants with roles and ASSO), the examples of
// docs/zdroje-a-bezpecne-ukladani-zadani.md (one record and one person, a census with six people, godparents as
// associations, a corrected date with "was / will be" and revert, new people with a family), and that reverting a
// batch gives the same export as before it.
// With the path of a saved response of GET /api/gedcom/get (full data: download it with ADMIN_API_TOKEN as Bearer and
// X-Database, see the skill change-graph-tree) the real tree is checked too: every source has a title and an archive,
// every participant is a person of the tree, and the round trip keeps sources, citations, participants and ASSO.
// Exit code 1 when a check fails.
import { readFileSync } from 'node:fs'
import { deserializeGedcomFile } from '../utils/gedcom/serialize'
import { parseGedcom, writeGedcom } from '../utils/gedcom/parser'
import { applyChangeOps, applyRecordChanges, changedSince, ChangeError, cloneTree, describeChanges, diffTrees, stableStringify, type ChangeOp } from '../utils/gedcom/changes'
import { associationsOfPerson, convertLinkToSource, factsOf, repositoryName, sourcesOfPerson, translationOf } from '../utils/gedcom/sources'
import type { GedcomFile } from '../types/gedcom'

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`)
}
const read = (text: string) => parseGedcom(text, { resolveXrefs: true }).file
const roundTrip = (file: GedcomFile) => read(writeGedcom(file))

// What a round trip must keep: sources, archives, every citation, participants and associations
const sourceSnapshot = (file: GedcomFile) => stableStringify({
  sources: [...file.sources.values()].map(source => ({ ...source, userData: undefined })),
  repositories: [...file.repositories.values()].map(repository => ({ name: repository.name, web: repository.web })),
  citations: [...file.individuals.values()].map(person => ({ id: person.xrefId, facts: factsOf(file, person).map(fact => [fact.key, fact.citations]) })),
  families: [...file.families.values()].map(family => [family.xrefId, family.marriage?.sourceCitations, family.sourceCitations]),
  associations: [...file.individuals.values()].map(person => [person.xrefId, person.associations]),
})
// The export without the header date and time
const exportOf = (file: GedcomFile) => writeGedcom(file).split('\n').filter(line => !/^1 DATE |^2 TIME /.test(line)).join('\n')

// ------------------------------------------------------------------------------------------- GEDCOM round trip
const SAMPLE = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Jan /Mikulík/
2 SOUR @S1@
3 PAGE snímek 129, zápis č. 7
3 QUAY 3
1 SEX M
2 SOUR @S1@
1 BIRT
2 DATE 11 JUN 1826
2 PLAC Všemina
2 SOUR @S1@
3 PAGE snímek 129
3 DATA
4 TEXT Joannes
5 CONT filius legitimus
3 QUAY 3
3 NOTE ověřeno
1 ASSO @I2@
2 RELA godparent
2 SOUR @S1@
1 SOUR @S1@
2 PAGE snímek 129
1 FAMC @F1@
0 @I2@ INDI
1 NAME Josef /Huzlík/
1 SEX M
0 @I3@ INDI
1 NAME Martin /Mikulík/
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I3@
1 CHIL @I1@
1 MARR
2 DATE 1820
2 SOUR @S1@
3 PAGE snímek 3
1 SOUR @S1@
2 PAGE snímek 4
2 QUAY 2
0 @S1@ SOUR
1 TITL Křest 11. 6. 1826, N Všemina 1785–1839, snímek 129
1 PUBL N Všemina 1785–1839, č. knihy 4974
1 REPO @R1@
1 TEXT Joannes, filius
2 CONT Martini Mikulik
1 NOTE Jan, syn
2 CONT Martina Mikulíka
1 OBJE @M1@
1 _LANG la
1 _VERIFIED_BY David
1 _VERIFIED_AT 2026-10-31
1 _PART @I1@
2 ROLE baptized
1 _PART @I2@
2 ROLE kmotr
2 AGE 59 (?)
2 NOTE soused
1 _PART @I3@
2 ROLE father
1 RIN 77
0 @R1@ REPO
1 NAME Moravský zemský archiv v Brně
1 WWW https://www.mza.cz/actapublica
0 @M1@ OBJE
1 FILE https://www.mza.cz/actapublica/matrika/detail/1?image=129
2 FORM url
2 TITL Snímek 129
0 TRLR`

{
  const first = read(SAMPLE)
  const source = first.sources.get('S1')!
  check('source fields are read', source.title.startsWith('Křest') && source.publication === 'N Všemina 1785–1839, č. knihy 4974' && source.repository === 'R1' && source.language === 'la' && source.verifiedBy === 'David' && source.verifiedAt === '2026-10-31',
    JSON.stringify({ title: source.title, publication: source.publication, repository: source.repository, language: source.language }))
  check('multi-line transcript and translation', source.text === 'Joannes, filius\nMartini Mikulik' && translationOf(source) === 'Jan, syn\nMartina Mikulíka', JSON.stringify([source.text, source.notes]))
  check('archive name', repositoryName(first, source) === 'Moravský zemský archiv v Brně')
  check('participants with roles (Czech role name read as code)', stableStringify(source.participants) === stableStringify([{ person: 'I1', role: 'baptized' }, { person: 'I2', role: 'godparent', age: '59 (?)', note: 'soused' }, { person: 'I3', role: 'father' }]), JSON.stringify(source.participants))
  const birth = first.individuals.get('I1')!.birth!
  check('citation of an event with page, text, confidence and note', stableStringify(birth.sourceCitations) === stableStringify([{ xref: 'S1', page: 'snímek 129', text: 'Joannes\nfilius legitimus', confidence: 3, notes: 'ověřeno' }]), JSON.stringify(birth.sourceCitations))
  check('date of the event is not taken from the citation', birth.date?.raw === '11 JUN 1826' && birth.place === 'Všemina')
  const person = first.individuals.get('I1')!
  check('citation of a name and of the sex', person.names[0]!.sourceCitations?.[0]?.page === 'snímek 129, zápis č. 7' && person.names[0]!.sourceCitations?.[0]?.confidence === 3 && person.sexCitations?.[0]?.xref === 'S1')
  check('person-level citation keeps its page', person.sourceCitations[0]?.page === 'snímek 129' && !person.attributes.PAGE)
  check('association with RELA and source', stableStringify(person.associations) === stableStringify([{ individualXref: 'I2', relationship: 'godparent', sourceCitations: [{ xref: 'S1' }] }]), JSON.stringify(person.associations))
  const family = first.families.get('F1')!
  check('family citations', family.marriage?.sourceCitations?.[0]?.page === 'snímek 3' && family.sourceCitations[0]?.page === 'snímek 4' && family.sourceCitations[0]?.confidence === 2 && !family.userData.PAGE)
  check('unknown tags of a source are kept', source.userData.extraTags?.[0]?.tag === 'RIN')
  const second = roundTrip(first)
  check('round trip keeps sources, citations, participants and ASSO', sourceSnapshot(first) === sourceSnapshot(second))
  check('round trip is stable (second export = first export)', exportOf(second) === exportOf(first))
  const entries = sourcesOfPerson(first, 'I2')
  check('the godparent sees the record with his role', entries.length === 1 && entries[0]!.roles[0]!.role === 'godparent')
  const both = associationsOfPerson(first, 'I2')
  check('the godparent sees the child (reverse association)', both.some(item => item.personId === 'I1' && item.reverse && item.relationship === 'godparent'))
}

// ------------------------------------------------------------------------------------------- batches (examples)
const BASE = `0 HEAD
0 @I1@ INDI
1 NAME Jan /Mikulík/
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /Mikulíková/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Františka /Mikulíková/
1 SEX F
1 FAMC @F1@
1 DEAT
2 DATE 5 JAN 1920
0 @I4@ INDI
1 NAME Josef /Mikulík/
1 SEX M
1 FAMC @F1@
0 @I5@ INDI
1 NAME Anna /Mikulíková/
1 SEX F
1 FAMC @F1@
0 @I6@ INDI
1 NAME Jan /Huzlík/
1 SEX M
0 @I7@ INDI
1 NAME Josefa /Huzlíková/
1 SEX F
0 @I8@ INDI
1 NAME Jan /Halžík/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I4@
1 CHIL @I5@
0 TRLR`

const base = read(BASE)
const run = (name: string, ops: ChangeOp[], confirmOverwrite = false) => {
  try {
    return applyChangeOps(base, ops, { confirmOverwrite })
  } catch (error) {
    check(name, false, error instanceof ChangeError ? error.errors.join('; ') : String(error))
    return null
  }
}

// 1. One record, one person
{
  const result = run('1: baptism of Jan', [
    { op: 'addSource', tempId: 's1', title: 'Křest 11. 6. 1826 – N Všemina 1785–1839, snímek 129', repository: 'Moravský zemský archiv v Brně', publication: 'N Všemina 1785–1839, č. knihy 4974', page: 'snímek 129', language: 'la', transcript: 'Joannes…', translation: 'Jan…', url: 'https://www.mza.cz/actapublica/matrika/detail/11530?image=129' },
    { op: 'setFact', person: 'I1', fact: 'birth', value: { date: '11 JUN 1826', place: 'Všemina' }, sources: [{ source: 's1', confidence: 3 }] },
  ])
  if (result) {
    const id = result.tempIds.s1!
    const source = result.file.sources.get(id)!
    check('1: source created with archive and link', source.title.includes('Křest') && repositoryName(result.file, source) === 'Moravský zemský archiv v Brně' && source.multimediaLinks.length === 1)
    check('1: birth cites the source with the default page', stableStringify(result.file.individuals.get('I1')!.birth!.sourceCitations) === stableStringify([{ xref: id, page: 'snímek 129', confidence: 3 }]))
    check('1: Jan is the baptized of the record', source.participants?.[0]?.person === 'I1' && source.participants[0].role === 'baptized')
    check('1: nothing overwritten', result.conflicts.length === 0)
    check('1: the original tree is untouched', !base.sources.size && !base.individuals.get('I1')!.birth)
    const second = roundTrip(result.file)
    check('1: round trip of the batch result', sourceSnapshot(result.file) === sourceSnapshot(second))
  }
}

// 2. One record, more people: census 1921 with six members of the household and their ages
{
  const members = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6']
  const result = run('2: census', [
    { op: 'addSource', tempId: 'c', title: 'Sčítání lidu 1921, Dešná č. 2', repository: 'Státní okresní archiv', participants: members.map((person, index) => ({ person, role: 'člen domácnosti', age: String(50 - index * 5) })) },
    ...members.map(person => ({ op: 'attachSource' as const, source: 'c', person, fact: 'CENS', page: 'list 1' })),
  ])
  if (result) {
    const source = result.file.sources.get(result.tempIds.c!)!
    check('2: six household members with ages', source.participants?.length === 6 && source.participants.every(item => item.role === 'household' && item.age))
    check('2: each member has a census event citing it', members.every(id => result.file.individuals.get(id)!.events.some(event => event.type === 'CENS' && event.sourceCitations?.[0]?.page === 'list 1')))
  }
}

// 3. Godparents as associations, visible at both children and both godparents
{
  const result = run('3: godparents', [
    { op: 'addSource', tempId: 'k1', title: 'Křest 1917', participants: [{ person: 'I4', role: 'křtěnec' }, { person: 'I6', role: 'kmotr' }, { person: 'I7', role: 'kmotr' }] },
    { op: 'addSource', tempId: 'k2', title: 'Křest 1918', participants: [{ person: 'I5', role: 'křtěnec' }, { person: 'I6', role: 'kmotr' }, { person: 'I7', role: 'kmotr' }] },
  ])
  if (result) {
    const of = (id: string) => associationsOfPerson(result.file, id)
    check('3: both children see both godparents', ['I4', 'I5'].every(child => ['I6', 'I7'].every(godparent => of(child).some(item => item.personId === godparent && !item.reverse && item.relationship === 'godparent'))))
    check('3: both godparents see both children', ['I6', 'I7'].every(godparent => ['I4', 'I5'].every(child => of(godparent).some(item => item.personId === child && item.reverse))))
    const second = roundTrip(result.file)
    check('3: ASSO survive the round trip', sourceSnapshot(result.file) === sourceSnapshot(second))
    // Removing the godparent from the record removes the association made from it
    const changed = applyChangeOps(result.file, [{ op: 'updateSource', source: result.tempIds.k1!, participants: [{ person: 'I4', role: 'baptized' }, { person: 'I6', role: 'godparent' }] }])
    check('3: association follows the record', !associationsOfPerson(changed.file, 'I4').some(item => item.personId === 'I7') && associationsOfPerson(changed.file, 'I4').some(item => item.personId === 'I6'))
  }
}

// 4. Correction of a date: "was / will be", confirmation, revert
{
  const ops: ChangeOp[] = [{ op: 'setFact', person: 'I3', fact: 'death', value: { date: '28 JAN 1920' } }, { op: 'addNote', person: 'I3', text: 'Dřívější údaj 5. 1. 1920 byl chybný.' }]
  const result = run('4: correction', ops)
  if (result) {
    check('4: overwrite reported as a conflict', result.conflicts.length === 1 && result.conflicts[0]!.before === '5 JAN 1920' && result.conflicts[0]!.after === '28 JAN 1920', JSON.stringify(result.conflicts))
    const changes = diffTrees(base, result.file)
    const preview = describeChanges(changes, [result.file, base], 'cs')
    const death = preview.find(item => item.id === 'I3')?.fields.find(field => field.field === 'DEAT')
    check('4: preview shows was / will be', death?.before === '5 JAN 1920' && death.after === '28 JAN 1920', JSON.stringify(death))
    // Revert: the "before" records back; the export equals the one before the batch
    const reverted = cloneTree(result.file)
    check('4: nothing changed meanwhile', changedSince(reverted, changes, 'after').length === 0)
    applyRecordChanges(reverted, JSON.parse(JSON.stringify(changes)), 'before')
    check('4: export after revert equals the export before', exportOf(reverted) === exportOf(base))
    // A later change of the same person blocks the revert
    const later = applyChangeOps(result.file, [{ op: 'setFact', person: 'I3', fact: 'death', value: { place: 'Dešná' } }]).file
    check('4: revert refused after a later change', changedSince(later, changes, 'after').length === 1)
  }
}

// 5. New people with a family (parents of Jan Halžík, marriage 6. 2. 1849)
{
  const result = run('5: new parents', [
    { op: 'addSource', tempId: 'm', title: 'Sňatek 6. 2. 1849' },
    { op: 'createPerson', tempId: 'otec', given: 'Josef', surname: 'Halžík', sex: 'M' },
    { op: 'createPerson', tempId: 'matka', given: 'Anna', surname: 'Plischlab (?)', sex: 'F' },
    { op: 'createFamily', tempId: 'f', husband: 'otec', wife: 'matka', children: ['I8'] },
    { op: 'attachSource', source: 'm', person: 'otec', role: 'otec' },
    { op: 'attachSource', source: 'm', person: 'matka', role: 'matka' },
  ])
  if (result) {
    const family = result.file.families.get(result.tempIds.f!)!
    const child = result.file.individuals.get('I8')!
    check('5: family links both ways', family.husband === result.tempIds.otec && family.wife === result.tempIds.matka && child.familiesAsChild.includes(family.xrefId)
      && result.file.individuals.get(result.tempIds.otec!)!.familiesAsSpouse.includes(family.xrefId))
    check('5: metadata counts follow', result.file.metadata.totalIndividuals === base.individuals.size + 2 && result.file.metadata.totalFamilies === base.families.size + 1)
  }
}

// Atomicity and validation
{
  let refused = false
  try { applyChangeOps(base, [{ op: 'createPerson', given: 'Nový' }, { op: 'setFact', person: 'I999', fact: 'birth', value: { date: '1900' } }]) } catch (error) { refused = error instanceof ChangeError }
  check('a failing operation refuses the whole batch', refused && base.individuals.size === 8)
  let removeRefused = false
  try { applyChangeOps(base, [{ op: 'removeFact', person: 'I3', fact: 'death' }]) } catch { removeRefused = true }
  check('removeFact needs confirm', removeRefused)
}

// Converting a link into a source record
{
  const file = read(BASE.replace('0 TRLR', '0 @M1@ OBJE\n1 FILE https://example.org/zapis\n2 FORM url\n2 TITL Zápis o úmrtí\n0 TRLR').replace('1 DEAT\n2 DATE 5 JAN 1920', '1 DEAT\n2 DATE 5 JAN 1920\n2 OBJE @M1@\n1 OBJE @M1@'))
  const id = convertLinkToSource(file, 'M1', {}, (_person, type) => (type === 'DEAT' ? 'deceased' : null))
  const person = file.individuals.get('I3')!
  check('conversion: the fact cites the new source', person.death?.sourceCitations?.[0]?.xref === id && !person.death.multimediaLinks?.length)
  check('conversion: the link moved into the source', file.sources.get(id)!.multimediaLinks.includes('M1') && !person.multimediaLinks.includes('M1') && file.sources.get(id)!.title === 'Zápis o úmrtí')
  check('conversion: the person is the deceased of the record', file.sources.get(id)!.participants?.[0]?.role === 'deceased')
}

// ------------------------------------------------------------------------------------------- real data
const dataPath = process.argv[2]
if (dataPath) {
  const json = JSON.parse(readFileSync(dataPath, 'utf8'))
  const file = deserializeGedcomFile(json.data.file)
  console.log(`\nreal data: ${file.individuals.size} people, ${file.sources.size} sources, ${file.repositories.size} archives${json.data.anonymized ? ' (ANONYMIZED: sources are not included, download with a token)' : ''}`)
  const noTitle = [...file.sources.values()].filter(source => !source.title.trim()).map(source => source.xrefId)
  const noArchive = [...file.sources.values()].filter(source => !repositoryName(file, source)).map(source => source.xrefId)
  check('every source has a title', !noTitle.length, noTitle.slice(0, 10).join(', '))
  check('every source has an archive', !noArchive.length, `${noArchive.length}: ${noArchive.slice(0, 10).join(', ')}`)
  const missing = [...file.sources.values()].flatMap(source => (source.participants || []).filter(item => !file.individuals.has(item.person)).map(item => `${source.xrefId}→${item.person}`))
  check('every participant is a person of the tree', !missing.length, missing.slice(0, 10).join(', '))
  const dangling = [...file.individuals.values()].flatMap(person => factsOf(file, person).flatMap(fact => fact.citations.filter(citation => !file.sources.has(citation.xref)).map(citation => `${person.xrefId}→${citation.xref}`)))
  check('every citation points to a source record', !dangling.length, `${dangling.length}: ${dangling.slice(0, 10).join(', ')}`)
  const second = roundTrip(file)
  check('round trip keeps sources, citations, participants and ASSO', sourceSnapshot(file) === sourceSnapshot(second))
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
