// Batches of changes (POST /api/gedcom/changes) and the record-level differences behind history and reverting.
//
// A batch is a list of operations (addSource, setFact, createPerson…). applyChangeOps applies them to a copy of the
// tree, all or nothing: any error and the copy is thrown away. Overwriting a value that is already there is reported
// as a conflict; the caller saves only when the batch confirms it (confirmOverwrite, or overwrite on the operation).
//
// diffTrees compares two trees record by record (people, families, sources, archives, links, notes); a history entry
// keeps each changed record before and after, so a change can be reverted by putting the "before" back, as long as
// the record still looks like "after". describeChanges turns the differences into the "was / will be" overview.
// Shared by the server (server/utils/treeStore.ts), the client and scripts/check-sources.mts.
import type { GedcomEvent, GedcomEventType, GedcomFamily, GedcomFile, GedcomIndividual, GedcomName, GedcomSource, GedcomSourceCitation, GedcomSourceParticipant } from '~~/types/gedcom'
import { parseGedcomDate } from './parser'
import { EVENT_TYPES } from './eventTypes'
import { formatPersonName, joinNameParts, isMarriedName, birthNameOf, marriedNameOf } from './names'
import { isConfidence, normalizeSourceRole, roleForFact } from './sourceRoles'
import {
  addCitation, addParticipant, applySourceFields, emptySource, normalizeXrefId, repositoryName, syncSourceAssociations, translationOf,
  type SourceFields,
} from './sources'
import { reviveDates } from './serialize'

// ---------------------------------------------------------------------------------------------------------------
// Operations

export interface FactValue {
  date?: string | null
  place?: string | null
  cause?: string | null
  age?: string | null
  description?: string | null
  latitude?: number | string | null
  longitude?: number | string | null
}

export interface SourceRef {
  source: string
  page?: string
  confidence?: number
  text?: string
}

export interface ParticipantInput {
  person: string
  role: string
  age?: string
  note?: string
}

export type ChangeOp =
  | ({ op: 'addSource'; tempId?: string; page?: string; participants?: ParticipantInput[] } & SourceFields)
  | ({ op: 'updateSource'; source: string; participants?: ParticipantInput[]; addParticipants?: ParticipantInput[] } & SourceFields)
  | { op: 'setFact'; person?: string; family?: string; spouse?: string; fact: string; index?: number; value: FactValue | string; sources?: SourceRef[]; overwrite?: boolean }
  | { op: 'setName'; person: string; given?: string; surname?: string; type?: 'birth' | 'married'; sources?: SourceRef[]; overwrite?: boolean }
  | { op: 'addNote'; person?: string; family?: string; text: string }
  | { op: 'createPerson'; tempId?: string; given?: string; surname?: string; sex?: 'M' | 'F' | ''; birth?: FactValue; death?: FactValue; sources?: SourceRef[] }
  | { op: 'createFamily'; tempId?: string; husband?: string; wife?: string; children?: string[]; marriage?: FactValue; sources?: SourceRef[] }
  | { op: 'linkChild'; family: string; child: string }
  | { op: 'linkSpouse'; family: string; person: string; role?: 'husband' | 'wife' }
  | { op: 'attachSource'; source: string; person?: string; family?: string; fact?: string; index?: number; role?: string; age?: string; note?: string; page?: string; confidence?: number; text?: string }
  | { op: 'removeFact'; person?: string; family?: string; fact: string; index?: number; confirm?: boolean }

export const CHANGE_OPS = ['addSource', 'updateSource', 'setFact', 'setName', 'addNote', 'createPerson', 'createFamily', 'linkChild', 'linkSpouse', 'attachSource', 'removeFact'] as const

export interface OverwriteConflict {
  op: number
  target: string
  field: string
  before: string
  after: string
}

export interface ApplyResult {
  file: GedcomFile
  tempIds: Record<string, string>
  conflicts: OverwriteConflict[]
  errors: string[]
}

export class ChangeError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('; '))
  }
}

// A copy of the tree to apply changes to (structuredClone keeps Map and Date); the raw lines of the import are not
// needed for that and are shared
export const cloneTree = (file: GedcomFile): GedcomFile => {
  const { rawLines, ...rest } = file
  return { ...structuredClone(rest), rawLines }
}

const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value).replace(/\r\n?/g, '\n').trim())

const OWN_EVENT_FIELDS: Record<string, keyof GedcomIndividual> = {
  birth: 'birth', BIRT: 'birth', baptism: 'baptism', BAPM: 'baptism', christening: 'christening', CHR: 'christening',
  death: 'death', DEAT: 'death', burial: 'burial', BURI: 'burial', cremation: 'cremation', CREM: 'cremation',
}
const EVENT_TYPE_OF_FIELD: Record<string, GedcomEventType> = { birth: 'BIRT', baptism: 'BAPM', christening: 'CHR', death: 'DEAT', burial: 'BURI', cremation: 'CREM' }
const FAMILY_EVENTS: Record<string, 'marriage' | 'divorce'> = { marriage: 'marriage', MARR: 'marriage', divorce: 'divorce', DIV: 'divorce' }

// The label of the fact for the roles of a source (birth → baptized…)
const factKind = (fact: string): string => (OWN_EVENT_FIELDS[fact] as string) || FAMILY_EVENTS[fact] || fact

export function applyChangeOps(original: GedcomFile, ops: ChangeOp[], options: { confirmOverwrite?: boolean } = {}): ApplyResult {
  const file = cloneTree(original)
  const errors: string[] = []
  const conflicts: OverwriteConflict[] = []
  const tempIds: Record<string, string> = {}
  const defaultPages: Record<string, string> = {}
  const touchedSources = new Set<string>()
  const reserved = { I: new Set<string>(), F: new Set<string>(), S: new Set<string>() }
  const allocate = (prefix: 'I' | 'F' | 'S', map: Map<string, unknown>): string => {
    let number = 1
    while (map.has(`${prefix}${number}`) || reserved[prefix].has(`${prefix}${number}`)) number++
    const id = `${prefix}${number}`
    reserved[prefix].add(id)
    return id
  }

  if (!Array.isArray(ops) || !ops.length) throw new ChangeError(['The batch has no operations'])
  // Ids of new people, families and sources are known before the operations run, so any operation can name them
  const assigned = new Map<number, string>()
  ops.forEach((op, index) => {
    if (!op || typeof op !== 'object' || !CHANGE_OPS.includes(op.op as typeof CHANGE_OPS[number])) {
      errors.push(`op ${index + 1}: unknown operation ${JSON.stringify((op as { op?: unknown })?.op ?? null)}`)
      return
    }
    if (op.op !== 'createPerson' && op.op !== 'createFamily' && op.op !== 'addSource') return
    const id = op.op === 'createPerson' ? allocate('I', file.individuals) : op.op === 'createFamily' ? allocate('F', file.families) : allocate('S', file.sources)
    assigned.set(index, id)
    const tempId = text(op.tempId)
    if (!tempId) return
    if (tempIds[tempId]) errors.push(`op ${index + 1}: tempId ${tempId} is used twice`)
    tempIds[tempId] = id
  })
  if (errors.length) throw new ChangeError(errors)

  const resolve = (value?: string): string => {
    const id = normalizeXrefId(value || '')
    return tempIds[id] || id
  }
  const personOf = (index: number, value?: string): GedcomIndividual | null => {
    const person = file.individuals.get(resolve(value))
    if (!person) errors.push(`op ${index + 1}: person ${value || '(missing)'} not found`)
    return person || null
  }
  const familyOf = (index: number, value?: string): GedcomFamily | null => {
    const family = file.families.get(resolve(value))
    if (!family) errors.push(`op ${index + 1}: family ${value || '(missing)'} not found`)
    return family || null
  }
  const sourceOf = (index: number, value?: string): GedcomSource | null => {
    const source = file.sources.get(resolve(value))
    if (!source) errors.push(`op ${index + 1}: source ${value || '(missing)'} not found`)
    return source || null
  }
  const nameOf = (person: GedcomIndividual) => `${formatPersonName(person.names) || '?'} (${person.xrefId})`
  const conflict = (index: number, op: object, target: string, field: string, before: string, after: string) => {
    if (!before || before === after) return
    conflicts.push({ op: index + 1, target, field, before, after: after || '—' })
    void op
  }

  const citationsFrom = (index: number, refs: SourceRef[] | undefined, person: GedcomIndividual | null, fact: string): GedcomSourceCitation[] => {
    const result: GedcomSourceCitation[] = []
    for (const ref of refs || []) {
      const source = sourceOf(index, ref?.source)
      if (!source) continue
      if (ref.confidence !== undefined && !isConfidence(Number(ref.confidence))) errors.push(`op ${index + 1}: confidence must be 0–3`)
      const citation: GedcomSourceCitation = { xref: source.xrefId }
      const page = text(ref.page) || defaultPages[source.xrefId]
      if (page) citation.page = page
      if (ref.confidence !== undefined && isConfidence(Number(ref.confidence))) citation.confidence = Number(ref.confidence) as GedcomSourceCitation['confidence']
      if (text(ref.text)) citation.text = text(ref.text)
      result.push(citation)
      // The person takes part in the record in the role the fact gives (birth → baptized…)
      const role = person ? roleForFact(factKind(fact), person.sex) : null
      if (person && role && !(source.participants || []).some(item => item.person === person.xrefId)) {
        addParticipant(source, { person: person.xrefId, role })
      }
      touchedSources.add(source.xrefId)
    }
    return result
  }
  const cite = (holder: { sourceCitations?: GedcomSourceCitation[] }, citations: GedcomSourceCitation[]) => {
    for (const citation of citations) holder.sourceCitations = addCitation(holder.sourceCitations || [], citation)
  }

  // Writes the given fields of a value into an event; returns the event (new when there was none)
  const writeEvent = (index: number, op: object, target: string, type: GedcomEventType, event: GedcomEvent | undefined, value: FactValue): GedcomEvent => {
    const result: GedcomEvent = event ? event : { type }
    const fields: [keyof FactValue, 'place' | 'cause' | 'age' | 'description'][] = [['place', 'place'], ['cause', 'cause'], ['age', 'age'], ['description', 'description']]
    if (value.date !== undefined) {
      const next = text(value.date)
      conflict(index, op, target, `${type}.date`, text(result.date?.raw), next)
      result.date = next ? parseGedcomDate(next) : undefined
    }
    for (const [key, field] of fields) {
      if (value[key] === undefined) continue
      const next = text(value[key])
      conflict(index, op, target, `${type}.${field}`, text(result[field]), next)
      result[field] = next || undefined
    }
    if (value.latitude !== undefined || value.longitude !== undefined) {
      const lat = Number(value.latitude)
      const lng = Number(value.longitude)
      const valid = value.latitude !== null && value.longitude !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      if (value.latitude !== null && value.longitude !== null && !valid) errors.push(`op ${index + 1}: invalid coordinates`)
      const before = result.coordinates ? result.coordinates.join(', ') : ''
      conflict(index, op, target, `${type}.coordinates`, before, valid ? `${lat}, ${lng}` : '')
      result.coordinates = valid ? [lat, lng] : undefined
    }
    return result
  }

  // The family a marriage of the person belongs to: the given one, the one with the given spouse, or the only one
  const marriageFamily = (index: number, person: GedcomIndividual | null, familyId?: string, spouse?: string): GedcomFamily | null => {
    if (familyId) return familyOf(index, familyId)
    if (!person) return null
    const families = person.familiesAsSpouse.map(id => file.families.get(id)).filter((family): family is GedcomFamily => !!family)
    if (spouse) {
      const spouseId = resolve(spouse)
      const found = families.find(family => family.husband === spouseId || family.wife === spouseId)
      if (!found) errors.push(`op ${index + 1}: ${person.xrefId} has no family with ${spouse}; use createFamily`)
      return found || null
    }
    if (families.length === 1) return families[0]!
    errors.push(`op ${index + 1}: ${person.xrefId} has ${families.length} families, give "family" or "spouse"`)
    return null
  }

  // The event of a fact with a setter; an event in person.events is found by its index or by its type and date
  const eventSlot = (index: number, op: { person?: string; family?: string; spouse?: string; fact: string; index?: number }, date?: string, create = true) => {
    const fact = op.fact
    const ownField = OWN_EVENT_FIELDS[fact]
    if (ownField) {
      const person = personOf(index, op.person)
      if (!person) return null
      const type = EVENT_TYPE_OF_FIELD[ownField as string] || (fact as GedcomEventType)
      return { person, target: nameOf(person), type, get: () => person[ownField] as GedcomEvent | undefined, set: (event?: GedcomEvent) => { (person[ownField] as GedcomEvent | undefined) = event } }
    }
    const familyField = FAMILY_EVENTS[fact]
    if (familyField) {
      const person = op.person ? personOf(index, op.person) : null
      const family = marriageFamily(index, person, op.family, op.spouse)
      if (!family) return null
      const type: GedcomEventType = familyField === 'marriage' ? 'MARR' : 'DIV'
      const spouses = [family.husband, family.wife].map(id => (id ? file.individuals.get(id) : undefined)).filter(Boolean) as GedcomIndividual[]
      return { person, family, target: `${spouses.map(nameOf).join(' & ') || family.xrefId}`, type, get: () => family[familyField], set: (event?: GedcomEvent) => { family[familyField] = event } }
    }
    if (!EVENT_TYPES.includes(fact as GedcomEventType)) {
      errors.push(`op ${index + 1}: unknown fact ${fact}`)
      return null
    }
    const person = personOf(index, op.person)
    if (!person) return null
    const type = fact as GedcomEventType
    let position = typeof op.index === 'number' ? op.index : -1
    if (position >= 0 && person.events[position]?.type !== type) {
      errors.push(`op ${index + 1}: ${person.xrefId} has no ${type} at index ${position}`)
      return null
    }
    if (position < 0) {
      const sameType = person.events.map((event, at) => ({ event, at })).filter(item => item.event.type === type)
      const match = date ? sameType.find(item => text(item.event.date?.raw) === text(date)) : sameType.length === 1 && !create ? sameType[0] : undefined
      position = match ? match.at : -1
    }
    return {
      person,
      target: nameOf(person),
      type,
      get: () => (position >= 0 ? person.events[position] : undefined),
      set: (event?: GedcomEvent) => {
        if (!event) { if (position >= 0) person.events.splice(position, 1); return }
        if (position >= 0) person.events[position] = event
        else { person.events.push(event); position = person.events.length - 1 }
      },
    }
  }

  const setName = (index: number, op: object, person: GedcomIndividual, given: string, surname: string, type: 'birth' | 'married', refs?: SourceRef[]) => {
    const existing = type === 'married' ? marriedNameOf(person.names) : birthNameOf(person.names)
    const full = joinNameParts({ prefix: existing?.prefix, given, surname, suffix: existing?.suffix })
    if (!full) {
      errors.push(`op ${index + 1}: the name is empty`)
      return
    }
    conflict(index, op, nameOf(person), type === 'married' ? 'marriedName' : 'name', existing?.full || '', full)
    const name: GedcomName = existing
      ? Object.assign(existing, { given, surname, full })
      : { full, given, surname, ...(type === 'married' ? { type: 'married' } : {}) }
    if (!existing) {
      if (type === 'married') {
        const birth = birthNameOf(person.names)
        if (birth && !birth.type) birth.type = 'birth'
        person.names.push(name)
      } else person.names.unshift(name)
    }
    cite(name, citationsFrom(index, refs, person, type === 'married' ? 'marriedName' : 'name'))
  }

  ops.forEach((op, index) => {
    if (!op || typeof op !== 'object') return
    switch (op.op) {
      case 'addSource': {
        const id = assigned.get(index)!
        const source = emptySource(id)
        file.sources.set(id, source)
        applySourceFields(file, source, op)
        if (!source.title) errors.push(`op ${index + 1}: addSource needs a title`)
        if (text(op.page)) defaultPages[id] = text(op.page)
        for (const participant of op.participants || []) {
          addParticipant(source, { person: resolve(participant.person), role: normalizeSourceRole(participant.role), age: text(participant.age) || undefined, note: text(participant.note) || undefined })
        }
        touchedSources.add(id)
        break
      }
      case 'updateSource': {
        const source = sourceOf(index, op.source)
        if (!source) break
        const before = { title: source.title, publication: source.publication || '', repository: repositoryName(file, source), text: source.text || '', translation: translationOf(source) }
        applySourceFields(file, source, op)
        const after = { title: source.title, publication: source.publication || '', repository: repositoryName(file, source), text: source.text || '', translation: translationOf(source) }
        for (const key of Object.keys(before) as (keyof typeof before)[]) {
          if ((op as unknown as Record<string, unknown>)[key === 'text' ? 'transcript' : key] !== undefined) conflict(index, op, `${source.title || source.xrefId} (${source.xrefId})`, key, before[key], after[key])
        }
        if (!source.title) errors.push(`op ${index + 1}: a source needs a title`)
        const toParticipant = (item: ParticipantInput): GedcomSourceParticipant => ({ person: resolve(item.person), role: normalizeSourceRole(item.role), age: text(item.age) || undefined, note: text(item.note) || undefined })
        if (op.participants) source.participants = []
        for (const item of [...(op.participants || []), ...(op.addParticipants || [])]) addParticipant(source, toParticipant(item))
        touchedSources.add(source.xrefId)
        break
      }
      case 'setName': {
        const person = personOf(index, op.person)
        if (person) setName(index, op, person, text(op.given), text(op.surname), op.type === 'married' ? 'married' : 'birth', op.sources)
        break
      }
      case 'setFact': {
        if (op.fact === 'name' || op.fact === 'marriedName') {
          const person = personOf(index, op.person)
          const value = (typeof op.value === 'object' && op.value ? op.value : {}) as { given?: string; surname?: string }
          if (person) setName(index, op, person, text(value.given), text(value.surname), op.fact === 'marriedName' ? 'married' : 'birth', op.sources)
          break
        }
        if (op.fact === 'sex') {
          const person = personOf(index, op.person)
          const sex = text(typeof op.value === 'string' ? op.value : (op.value as { sex?: string })?.sex).toUpperCase()
          if (!person) break
          if (sex !== 'M' && sex !== 'F' && sex !== '') { errors.push(`op ${index + 1}: sex must be M or F`); break }
          conflict(index, op, nameOf(person), 'sex', person.sex, sex)
          person.sex = sex as GedcomIndividual['sex']
          const citations = citationsFrom(index, op.sources, person, 'sex')
          for (const citation of citations) person.sexCitations = addCitation(person.sexCitations || [], citation)
          break
        }
        const value = (typeof op.value === 'object' && op.value ? op.value : {}) as FactValue
        const slot = eventSlot(index, op, value.date ?? undefined)
        if (!slot) break
        const event = writeEvent(index, op, slot.target, slot.type, slot.get(), value)
        slot.set(event)
        if (slot.type === 'DEAT' && slot.person) slot.person.living = undefined
        const people = slot.person ? [slot.person] : 'family' in slot && slot.family ? [slot.family.husband, slot.family.wife].map(id => (id ? file.individuals.get(id) : undefined)).filter((item): item is GedcomIndividual => !!item) : []
        for (const person of people.length ? people : [null]) cite(event, citationsFrom(index, op.sources, person, op.fact))
        break
      }
      case 'addNote': {
        const note = text(op.text)
        if (!note) { errors.push(`op ${index + 1}: the note is empty`); break }
        if (op.person) {
          const person = personOf(index, op.person)
          if (person) person.notes.push(...note.split('\n').map(line => line.trim()).filter(Boolean))
        } else if (op.family) {
          const family = familyOf(index, op.family)
          if (family) family.notes.push(note)
        } else errors.push(`op ${index + 1}: addNote needs a person or a family`)
        break
      }
      case 'createPerson': {
        const id = assigned.get(index)!
        const given = text(op.given)
        const surname = text(op.surname)
        if (!given && !surname) errors.push(`op ${index + 1}: a new person needs a name`)
        const sex = text(op.sex).toUpperCase()
        const person: GedcomIndividual = {
          xrefId: id,
          names: [{ full: joinNameParts({ given, surname }), given, surname }],
          sex: sex === 'M' || sex === 'F' ? sex : '',
          events: [], familiesAsChild: [], familiesAsSpouse: [], associations: [], multimediaLinks: [], notes: [], sourceCitations: [], attributes: {}, userData: {},
        }
        file.individuals.set(id, person)
        cite(person.names[0]!, citationsFrom(index, op.sources, person, 'name'))
        if (op.birth) person.birth = writeEvent(index, op, nameOf(person), 'BIRT', undefined, op.birth)
        if (op.death) person.death = writeEvent(index, op, nameOf(person), 'DEAT', undefined, op.death)
        break
      }
      case 'createFamily': {
        const husband = op.husband ? personOf(index, op.husband) : null
        const wife = op.wife ? personOf(index, op.wife) : null
        // The same couple has one family
        const existing = (husband || wife) ? [...file.families.values()].find(family => family.husband === (husband?.xrefId) && family.wife === (wife?.xrefId)) : undefined
        const id = existing?.xrefId || assigned.get(index)!
        const family: GedcomFamily = existing || { xrefId: id, husband: husband?.xrefId, wife: wife?.xrefId, children: [], notes: [], sourceCitations: [], multimediaLinks: [], userData: {} }
        if (!existing) file.families.set(id, family)
        if (existing && op.tempId) tempIds[text(op.tempId)] = existing.xrefId
        for (const spouse of [husband, wife]) if (spouse && !spouse.familiesAsSpouse.includes(id)) spouse.familiesAsSpouse.push(id)
        for (const childId of op.children || []) {
          const child = personOf(index, childId)
          if (!child) continue
          if (!family.children.includes(child.xrefId)) family.children.push(child.xrefId)
          if (!child.familiesAsChild.includes(id)) child.familiesAsChild.push(id)
        }
        if (op.marriage) family.marriage = writeEvent(index, op, id, 'MARR', family.marriage, op.marriage)
        if (op.sources?.length) {
          const marriage = family.marriage ||= { type: 'MARR' }
          for (const spouse of [husband, wife].filter(Boolean)) cite(marriage, citationsFrom(index, op.sources, spouse, 'marriage'))
          if (!husband && !wife) cite(marriage, citationsFrom(index, op.sources, null, 'marriage'))
        }
        break
      }
      case 'linkChild': {
        const family = familyOf(index, op.family)
        const child = personOf(index, op.child)
        if (!family || !child) break
        if (child.xrefId === family.husband || child.xrefId === family.wife) { errors.push(`op ${index + 1}: a parent cannot be a child of the same family`); break }
        if (!family.children.includes(child.xrefId)) family.children.push(child.xrefId)
        if (!child.familiesAsChild.includes(family.xrefId)) child.familiesAsChild.push(family.xrefId)
        break
      }
      case 'linkSpouse': {
        const family = familyOf(index, op.family)
        const person = personOf(index, op.person)
        if (!family || !person) break
        const slot = op.role || (person.sex === 'F' ? 'wife' : person.sex === 'M' ? 'husband' : !family.husband ? 'husband' : 'wife')
        if (family[slot] && family[slot] !== person.xrefId) { errors.push(`op ${index + 1}: ${family.xrefId} already has a ${slot}`); break }
        family[slot] = person.xrefId
        if (!person.familiesAsSpouse.includes(family.xrefId)) person.familiesAsSpouse.push(family.xrefId)
        break
      }
      case 'attachSource': {
        const source = sourceOf(index, op.source)
        if (!source) break
        const person = op.person ? personOf(index, op.person) : null
        touchedSources.add(source.xrefId)
        if (op.fact) {
          const ref: SourceRef = { source: source.xrefId, page: op.page, confidence: op.confidence, text: op.text }
          if (op.fact === 'name' || op.fact === 'marriedName') {
            const name = person ? (op.fact === 'name' ? birthNameOf(person.names) : marriedNameOf(person.names)) : undefined
            if (!name) { errors.push(`op ${index + 1}: ${op.person} has no ${op.fact}`); break }
            cite(name, citationsFrom(index, [ref], person, op.fact))
          } else if (op.fact === 'sex') {
            if (!person) { errors.push(`op ${index + 1}: attachSource to sex needs a person`); break }
            for (const citation of citationsFrom(index, [ref], person, 'sex')) person.sexCitations = addCitation(person.sexCitations || [], citation)
          } else if (op.fact === 'person') {
            if (!person) { errors.push(`op ${index + 1}: attachSource needs a person`); break }
            for (const citation of citationsFrom(index, [ref], person, 'person')) person.sourceCitations = addCitation(person.sourceCitations, citation)
          } else {
            const slot = eventSlot(index, { ...op, fact: op.fact }, undefined, false)
            if (!slot) break
            // A record of a birth without a known date makes the event ("1 BIRT" with the source)
            const event = slot.get() || { type: slot.type }
            slot.set(event)
            cite(event, citationsFrom(index, [ref], person, op.fact))
          }
        }
        if (person && (op.role || !op.fact)) {
          addParticipant(source, { person: person.xrefId, role: normalizeSourceRole(op.role || 'other'), age: text(op.age) || undefined, note: text(op.note) || undefined })
        }
        if (!person && !op.fact) errors.push(`op ${index + 1}: attachSource needs a person or a fact`)
        break
      }
      case 'removeFact': {
        if (op.confirm !== true) { errors.push(`op ${index + 1}: removeFact needs "confirm": true`); break }
        if (op.fact === 'marriedName') {
          const person = personOf(index, op.person)
          if (person) person.names = person.names.filter(name => !isMarriedName(name))
          break
        }
        if (op.fact === 'sex') {
          const person = personOf(index, op.person)
          if (person) { person.sex = ''; person.sexCitations = undefined; person.sexLinks = undefined }
          break
        }
        const slot = eventSlot(index, op, undefined, false)
        if (!slot) break
        if (!slot.get()) { errors.push(`op ${index + 1}: there is no ${op.fact} to remove`); break }
        slot.set(undefined)
        break
      }
    }
  })

  // Every participant must be a person of the tree; godparents and witnesses become associations
  for (const id of touchedSources) {
    const source = file.sources.get(id)
    for (const participant of source?.participants || []) {
      if (!file.individuals.has(participant.person)) errors.push(`source ${id}: person ${participant.person} not found`)
    }
    if (source) syncSourceAssociations(file, id)
  }
  file.metadata = {
    ...file.metadata,
    totalIndividuals: file.individuals.size,
    totalFamilies: file.families.size,
    totalSources: file.sources.size,
    totalRepositories: file.repositories.size,
    totalMultimedia: file.multimedia.size,
    totalNotes: file.notes.size,
  }
  if (errors.length) throw new ChangeError(errors)
  void options
  return { file, tempIds, conflicts, errors }
}

// ---------------------------------------------------------------------------------------------------------------
// Record differences

export const RECORD_KINDS = ['individuals', 'families', 'sources', 'repositories', 'multimedia', 'notes'] as const
export type RecordKind = typeof RECORD_KINDS[number]

export interface RecordChange {
  kind: RecordKind
  id: string
  before?: unknown
  after?: unknown
}

export const recordKey = (kind: RecordKind, id: string): string => `${kind}:${id}`

// JSON with sorted keys, so the same record always gives the same text (undefined fields are left out like in JSON)
export const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (item instanceof Map) return Object.fromEntries([...item.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))))
  if (item && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)) {
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, (item as Record<string, unknown>)[key]]))
  }
  return item
})

// A record through JSON and back (Dates revived), as it is kept in history entries
export const plainRecord = <T>(value: T): T => (value === undefined ? value : reviveDates(JSON.parse(JSON.stringify(value))))

export function diffTrees(before: GedcomFile | null, after: GedcomFile): RecordChange[] {
  const changes: RecordChange[] = []
  for (const kind of RECORD_KINDS) {
    const old = (before?.[kind] || new Map()) as Map<string, unknown>
    const next = after[kind] as Map<string, unknown>
    for (const [id, record] of next) {
      const previous = old.get(id)
      if (previous === undefined) changes.push({ kind, id, after: record })
      else if (previous !== record && stableStringify(previous) !== stableStringify(record)) changes.push({ kind, id, before: previous, after: record })
    }
    for (const [id, record] of old) if (!next.has(id)) changes.push({ kind, id, before: record })
  }
  return changes
}

// Puts one side of the changes into the tree ("before" reverts them); counts of the metadata follow
export function applyRecordChanges(file: GedcomFile, changes: RecordChange[], side: 'before' | 'after') {
  for (const change of changes) {
    const map = file[change.kind] as Map<string, unknown>
    const record = side === 'before' ? change.before : change.after
    if (record === undefined || record === null) map.delete(change.id)
    else map.set(change.id, reviveDates(structuredClone(record)))
  }
  file.metadata = {
    ...file.metadata,
    totalIndividuals: file.individuals.size,
    totalFamilies: file.families.size,
    totalSources: file.sources.size,
    totalRepositories: file.repositories.size,
    totalMultimedia: file.multimedia.size,
    totalNotes: file.notes.size,
  }
}

// Records whose current state differs from the given side of the changes (a revert must not undo someone else's later
// change, a delta save must start from what the client saw)
export function changedSince(file: GedcomFile, changes: RecordChange[], side: 'before' | 'after'): RecordChange[] {
  return changes.filter((change) => {
    const current = (file[change.kind] as Map<string, unknown>).get(change.id)
    const expected = side === 'before' ? change.before : change.after
    if (current === undefined || expected === undefined || expected === null) return (current === undefined) !== (expected === undefined || expected === null)
    return stableStringify(current) !== stableStringify(expected)
  })
}

// ---------------------------------------------------------------------------------------------------------------
// The "was / will be" overview

export type Lang = 'cs' | 'en'

export interface ChangeField { field: string; before: string; after: string }

export interface ChangePreviewItem {
  kind: RecordKind
  id: string
  label: string
  action: 'added' | 'changed' | 'removed'
  fields: ChangeField[]
}

const WORDS = {
  cs: { cause: 'příčina', age: 'věk', confidence: 'jistota', page: 'str.', unknown: '?', male: 'muž', female: 'žena' },
  en: { cause: 'cause', age: 'age', confidence: 'confidence', page: 'p.', unknown: '?', male: 'male', female: 'female' },
}
const ROLE_WORDS: Record<Lang, Record<string, string>> = {
  cs: { baptized: 'křtěnec', father: 'otec', mother: 'matka', godparent: 'kmotr', witness: 'svědek', groom: 'ženich', bride: 'nevěsta', deceased: 'zemřelý', household: 'člen domácnosti', other: 'jiné' },
  en: { baptized: 'baptized', father: 'father', mother: 'mother', godparent: 'godparent', witness: 'witness', groom: 'groom', bride: 'bride', deceased: 'deceased', household: 'household member', other: 'other' },
}
export const roleLabel = (role: string, lang: Lang): string => ROLE_WORDS[lang][role] || role

// Texts of the fields of a record, compared field by field
function recordFields(kind: RecordKind, record: any, files: GedcomFile[], lang: Lang): Record<string, string> {
  if (!record) return {}
  const words = WORDS[lang]
  const personName = (id?: string): string => {
    if (!id) return ''
    for (const file of files) {
      const person = file.individuals.get(id)
      if (person) return `${formatPersonName(person.names) || words.unknown} (${id})`
    }
    return id
  }
  const sourceTitle = (id: string): string => {
    for (const file of files) {
      const source = file.sources.get(id)
      if (source) return source.title || id
    }
    return id
  }
  const citations = (list?: GedcomSourceCitation[]): string => (list || [])
    .map(citation => [sourceTitle(citation.xref), citation.page ? `${citation.page}` : '', citation.confidence !== undefined ? `${words.confidence} ${citation.confidence}` : ''].filter(Boolean).join(', '))
    .map(item => `[${item}]`).join(' ')
  const event = (value?: GedcomEvent): string => {
    if (!value) return ''
    const parts = [value.date?.raw, value.place, value.cause ? `${words.cause}: ${value.cause}` : '', value.age ? `${words.age} ${value.age}` : '', value.description,
      value.coordinates ? value.coordinates.map(coordinate => Number(coordinate).toFixed(5)).join(', ') : ''].filter(Boolean).join(', ')
    const sources = citations(value.sourceCitations)
    const links = (value.multimediaLinks || []).length ? `+${value.multimediaLinks!.length} 🔗` : ''
    return [parts || '✓', sources, links].filter(Boolean).join(' ')
  }
  const fields: Record<string, string> = {}
  switch (kind) {
    case 'individuals': {
      const person = record as GedcomIndividual
      ;(person.names || []).forEach((name) => {
        const key = isMarriedName(name) ? 'marriedName' : fields.name === undefined ? 'name' : 'otherNames'
        fields[key] = [fields[key], `${name.full}${name.sourceCitations?.length ? ` ${citations(name.sourceCitations)}` : ''}`].filter(Boolean).join('; ')
      })
      fields.sex = person.sex === 'M' ? words.male : person.sex === 'F' ? words.female : ''
      for (const [field, type] of Object.entries(EVENT_TYPE_OF_FIELD)) fields[type] = event((person as any)[field])
      const counts: Record<string, number> = {}
      for (const item of person.events || []) {
        counts[item.type] = (counts[item.type] || 0) + 1
        fields[counts[item.type]! > 1 ? `${item.type}#${counts[item.type]}` : item.type] = event(item)
      }
      fields.notes = (person.notes || []).join(' / ')
      fields.associations = (person.associations || []).map(item => `${roleLabel(item.relationship, lang)}: ${personName(item.individualXref)}`).join('; ')
      fields.sources = citations(person.sourceCitations)
      fields.links = String((person.multimediaLinks || []).length || '')
      fields.parents = (person.familiesAsChild || []).join(', ')
      fields.partners = (person.familiesAsSpouse || []).join(', ')
      break
    }
    case 'families': {
      const family = record as GedcomFamily
      fields.husband = personName(family.husband)
      fields.wife = personName(family.wife)
      fields.children = (family.children || []).map(personName).join('; ')
      fields.MARR = event(family.marriage)
      fields.DIV = event(family.divorce)
      fields.notes = (family.notes || []).join(' / ')
      break
    }
    case 'sources': {
      const source = record as GedcomSource
      fields.title = source.title || ''
      fields.publication = source.publication || ''
      const repository = source.repository ? files.map(file => file.repositories.get(source.repository!)?.name).find(Boolean) || source.repository : ''
      fields.repository = repository
      fields.language = source.language || ''
      fields.transcript = source.text || ''
      fields.translation = translationOf(source)
      fields.participants = (source.participants || []).map(item => `${personName(item.person)}: ${roleLabel(item.role, lang)}${item.age ? `, ${words.age} ${item.age}` : ''}`).join('; ')
      fields.verified = [source.verifiedBy, source.verifiedAt].filter(Boolean).join(', ')
      fields.links = String((source.multimediaLinks || []).length || '')
      break
    }
    case 'repositories':
      fields.title = record.name || ''
      fields.web = (record.web || []).join(', ')
      break
    case 'multimedia':
      fields.title = record.title || ''
      fields.file = record.file || ''
      break
    case 'notes':
      fields.notes = record.text || ''
      break
  }
  return fields
}

const recordLabel = (kind: RecordKind, id: string, record: any, lang: Lang): string => {
  if (!record) return id
  switch (kind) {
    case 'individuals': return `${formatPersonName(record.names) || WORDS[lang].unknown} (${id})`
    case 'sources': return `${record.title || id} (${id})`
    case 'repositories': return `${record.name || id} (${id})`
    case 'multimedia': return `${record.title || record.file || id} (${id})`
    default: return id
  }
}

export function describeChanges(changes: RecordChange[], files: GedcomFile[], lang: Lang = 'cs'): ChangePreviewItem[] {
  // Lists are compared after the record arrives through JSON (history), so revive Dates first
  return changes.map((change) => {
    const before = recordFields(change.kind, change.before, files, lang)
    const after = recordFields(change.kind, change.after, files, lang)
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(field => (before[field] || '') !== (after[field] || ''))
      .map(field => ({ field, before: before[field] || '', after: after[field] || '' }))
    return {
      kind: change.kind,
      id: change.id,
      label: recordLabel(change.kind, change.id, change.after ?? change.before, lang),
      action: change.before === undefined ? 'added' : change.after === undefined ? 'removed' : 'changed',
      fields,
    }
  })
}

// A short description of one operation of a batch, for the list of the pending changes
export function describeOp(op: ChangeOp, file: GedcomFile, lang: Lang = 'cs'): string {
  const name = (id?: string) => {
    const person = id ? file.individuals.get(normalizeXrefId(id)) : undefined
    return person ? formatPersonName(person.names) || id! : id || ''
  }
  const value = (item: unknown) => (typeof item === 'object' && item ? Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([, v]) => String(v)).join(', ') : String(item ?? ''))
  const cs = lang === 'cs'
  switch (op.op) {
    case 'addSource': return `${cs ? 'Nový zdroj' : 'New source'}: ${op.title || ''}`
    case 'updateSource': return `${cs ? 'Úprava zdroje' : 'Source changed'}: ${file.sources.get(normalizeXrefId(op.source))?.title || op.source}`
    case 'setFact': return `${name(op.person) || op.family || ''} – ${op.fact}: ${value(op.value)}`
    case 'setName': return `${name(op.person)} – ${cs ? 'jméno' : 'name'}: ${[op.given, op.surname].filter(Boolean).join(' ')}`
    case 'addNote': return `${name(op.person) || op.family || ''} – ${cs ? 'poznámka' : 'note'}: ${op.text}`
    case 'createPerson': return `${cs ? 'Nová osoba' : 'New person'}: ${[op.given, op.surname].filter(Boolean).join(' ')}`
    case 'createFamily': return `${cs ? 'Nová rodina' : 'New family'}: ${[name(op.husband), name(op.wife)].filter(Boolean).join(' & ')}`
    case 'linkChild': return `${cs ? 'Dítě v rodině' : 'Child in family'} ${op.family}: ${name(op.child)}`
    case 'linkSpouse': return `${cs ? 'Partner v rodině' : 'Partner in family'} ${op.family}: ${name(op.person)}`
    case 'attachSource': return `${cs ? 'Zdroj' : 'Source'} ${file.sources.get(normalizeXrefId(op.source))?.title || op.source} → ${name(op.person) || op.family || ''}${op.fact ? ` (${op.fact})` : ''}${op.role ? `, ${roleLabel(normalizeSourceRole(op.role), lang)}` : ''}`
    case 'removeFact': return `${cs ? 'Smazat' : 'Remove'} ${op.fact}: ${name(op.person) || op.family || ''}`
    default: return (op as { op: string }).op
  }
}
