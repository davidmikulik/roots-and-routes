// Source records (GEDCOM SOUR) shared by the client and the server: the archive (REPO record), the translation (first
// NOTE), the people in the record with their roles (participants, our own tag _PART) and the associations (ASSO)
// that godparents and witnesses get from them. A fact of a person cites a source by GedcomSourceCitation (page and
// confidence); the older way, a link or attachment (OBJE) under the fact, keeps working next to it.
// See docs/zdroje-a-bezpecne-ukladani-zadani.md.
import type {
  GedcomEvent, GedcomFile, GedcomIndividual, GedcomRepository, GedcomSource, GedcomSourceCitation, GedcomSourceParticipant, SourceRole,
} from '~~/types/gedcom'
import { ASSOCIATION_ROLES, PRINCIPAL_ROLES } from './sourceRoles'

export const normalizeXrefId = (value: string): string => String(value || '').trim().replace(/^@|@$/g, '')

// The first free id with the prefix (S1, R1, M1…)
export const nextXref = (used: Map<string, unknown>, prefix: string): string => {
  let number = 1
  while (used.has(`${prefix}${number}`)) number++
  return `${prefix}${number}`
}

const fold = (value = ''): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

export const emptySource = (xrefId: string): GedcomSource => ({ xrefId, title: '', multimediaLinks: [], notes: [], userData: {} })

// The archive of a source: the name of its REPO record, or the text the file gives instead of a record
export const repositoryOf = (file: GedcomFile, source: GedcomSource): GedcomRepository | undefined =>
  source.repository ? file.repositories.get(source.repository) : undefined

export const repositoryName = (file: GedcomFile, source: GedcomSource): string =>
  repositoryOf(file, source)?.name || (source.repository && !file.repositories.has(source.repository) ? source.repository : '')

// The REPO record of an archive by its name (without diacritics and case), created when missing; null for no name
export const ensureRepository = (file: GedcomFile, name: string, web?: string): string | null => {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) return null
  const existing = [...file.repositories.values()].find(repository => fold(repository.name) === fold(clean))
  if (existing) {
    if (web && !(existing.web || []).includes(web)) existing.web = [...(existing.web || []), web]
    return existing.xrefId
  }
  const id = nextXref(file.repositories, 'R')
  file.repositories.set(id, { xrefId: id, name: clean, phone: [], email: [], web: web ? [web] : [], notes: [], userData: {} })
  file.metadata.totalRepositories = file.repositories.size
  return id
}

export const translationOf = (source: GedcomSource): string => source.notes?.[0] || ''

export const setTranslation = (source: GedcomSource, translation: string) => {
  const rest = (source.notes || []).slice(1)
  source.notes = translation.trim() ? [translation.trim(), ...rest] : rest
}

const isWebAddress = (value?: string): value is string => !!value && /^https?:\/\//i.test(value.trim())
const isStored = (value?: string): value is string => !!value && value.startsWith('media/')
const IMAGE = /\.(jpe?g|png|gif|webp)$/i

// "Open in the archive": the first web address among the links of the source (or the original address of a copy),
// otherwise the web of the archive
export const archiveUrlOf = (file: GedcomFile, source: GedcomSource): string => {
  for (const id of source.multimediaLinks || []) {
    const media = file.multimedia.get(id)
    if (isWebAddress(media?.file)) return media!.file!.trim()
    if (isWebAddress(media?.url)) return media!.url!.trim()
  }
  return (repositoryOf(file, source)?.web || []).find(isWebAddress) || ''
}

// Images of the record stored in the tree (media/<name>)
export const sourceImages = (file: GedcomFile, source: GedcomSource): { id: string; file: string; title: string }[] =>
  (source.multimediaLinks || []).flatMap((id) => {
    const media = file.multimedia.get(id)
    return media && isStored(media.file) && IMAGE.test(media.file) ? [{ id, file: media.file, title: media.title || '' }] : []
  })

// Facts of a person that can cite a source, with the citations (and links) they have. `key` is the fact for the
// editor and the batch operations (name, marriedName, sex, birth, death, marriage, or the event type with its index)
export interface FactRef {
  key: string
  type: string
  citations: GedcomSourceCitation[]
  links: string[]
  familyId?: string
}

const OWN_EVENTS: [keyof GedcomIndividual, string][] = [
  ['birth', 'birth'], ['baptism', 'BAPM'], ['christening', 'CHR'], ['death', 'death'], ['burial', 'BURI'], ['cremation', 'CREM'],
]

export const factsOf = (file: GedcomFile, person: GedcomIndividual): FactRef[] => {
  const facts: FactRef[] = []
  person.names.forEach((name, index) => facts.push({
    key: name.type === 'married' ? 'marriedName' : index === 0 ? 'name' : `name:${index}`,
    type: 'NAME',
    citations: name.sourceCitations || [],
    links: name.multimediaLinks || [],
  }))
  if (person.sex) facts.push({ key: 'sex', type: 'SEX', citations: person.sexCitations || [], links: person.sexLinks || [] })
  for (const [field, key] of OWN_EVENTS) {
    const event = person[field] as GedcomEvent | undefined
    if (event) facts.push({ key, type: event.type, citations: event.sourceCitations || [], links: event.multimediaLinks || [] })
  }
  person.events.forEach((event, index) => facts.push({ key: `${event.type}:${index}`, type: event.type, citations: event.sourceCitations || [], links: event.multimediaLinks || [] }))
  for (const familyId of person.familiesAsSpouse) {
    const family = file.families.get(familyId)
    if (family?.marriage) facts.push({ key: 'marriage', type: 'MARR', citations: family.marriage.sourceCitations || [], links: family.marriage.multimediaLinks || [], familyId })
    if (family?.divorce) facts.push({ key: 'divorce', type: 'DIV', citations: family.divorce.sourceCitations || [], links: family.divorce.multimediaLinks || [], familyId })
  }
  if (person.sourceCitations?.length) facts.push({ key: 'person', type: 'INDI', citations: person.sourceCitations, links: [] })
  return facts
}

// The source records of a person: those their facts cite and those they take part in, with the facts, the citations
// and the roles
export interface PersonSourceEntry {
  source: GedcomSource
  facts: { type: string; citation: GedcomSourceCitation }[]
  roles: GedcomSourceParticipant[]
}

export const sourcesOfPerson = (file: GedcomFile, personId: string): PersonSourceEntry[] => {
  const person = file.individuals.get(personId)
  if (!person) return []
  const entries = new Map<string, PersonSourceEntry>()
  const entry = (id: string): PersonSourceEntry | null => {
    const source = file.sources.get(id)
    if (!source) return null
    if (!entries.has(id)) entries.set(id, { source, facts: [], roles: [] })
    return entries.get(id)!
  }
  for (const fact of factsOf(file, person)) for (const citation of fact.citations) entry(citation.xref)?.facts.push({ type: fact.type, citation })
  for (const source of file.sources.values()) {
    const roles = (source.participants || []).filter(participant => participant.person === personId)
    if (roles.length) entry(source.xrefId)!.roles.push(...roles)
  }
  return [...entries.values()]
}

// The best confidence a source is cited with (undefined when no citation says it)
export const bestConfidence = (citations: GedcomSourceCitation[]): number | undefined => {
  const values = citations.map(citation => citation.confidence).filter((value): value is NonNullable<typeof value> => value !== undefined && value !== null)
  return values.length ? Math.max(...values) : undefined
}

// Every citation of the source in the tree (people's facts, families, associations)
export const citationsOfSource = (file: GedcomFile, sourceId: string): { personId?: string; familyId?: string; type: string; citation: GedcomSourceCitation }[] => {
  const result: { personId?: string; familyId?: string; type: string; citation: GedcomSourceCitation }[] = []
  for (const person of file.individuals.values()) {
    for (const fact of factsOf(file, person)) {
      if (fact.familyId) continue
      for (const citation of fact.citations) if (citation.xref === sourceId) result.push({ personId: person.xrefId, type: fact.type, citation })
    }
  }
  for (const family of file.families.values()) {
    for (const event of [family.marriage, family.divorce, ...(family.engagements || [])]) {
      for (const citation of event?.sourceCitations || []) if (citation.xref === sourceId) result.push({ familyId: family.xrefId, type: event!.type, citation })
    }
    for (const citation of family.sourceCitations || []) if (citation.xref === sourceId) result.push({ familyId: family.xrefId, type: 'FAM', citation })
  }
  return result
}

// People a source is about: participants and people whose facts cite it (with the spouses of a cited marriage)
export const peopleOfSource = (file: GedcomFile, sourceId: string): string[] => {
  const ids = new Set<string>((file.sources.get(sourceId)?.participants || []).map(participant => participant.person))
  for (const item of citationsOfSource(file, sourceId)) {
    if (item.personId) ids.add(item.personId)
    if (item.familyId) {
      const family = file.families.get(item.familyId)
      for (const id of [family?.husband, family?.wife]) if (id) ids.add(id)
    }
  }
  return [...ids].filter(id => file.individuals.has(id))
}

// Adds a person to the record with the role (no duplicates of the same person and role)
export const addParticipant = (source: GedcomSource, participant: GedcomSourceParticipant): boolean => {
  const list = source.participants ||= []
  const existing = list.find(item => item.person === participant.person && item.role === participant.role)
  if (existing) {
    if (participant.age && !existing.age) existing.age = participant.age
    if (participant.note && !existing.note) existing.note = participant.note
    return false
  }
  list.push({ ...participant })
  return true
}

// Adds a citation to a list unless the same source with the same page is there; the confidence and text fill in
export const addCitation = (list: GedcomSourceCitation[], citation: GedcomSourceCitation): GedcomSourceCitation[] => {
  const existing = list.find(item => item.xref === citation.xref && (item.page || '') === (citation.page || ''))
  if (existing) {
    if (citation.confidence !== undefined) existing.confidence = citation.confidence
    if (citation.text && !existing.text) existing.text = citation.text
    return list
  }
  return [...list, { ...citation }]
}

// Godparents and witnesses of a record become associations of its principal people (the baptized, the deceased, the
// groom and the bride): "1 ASSO @godparent@ / 2 RELA godparent / 2 SOUR @S1@" in the principal's record. Associations
// made from the source earlier that its roles no longer give are removed; those without the source stay.
// Returns the number of associations added and removed.
export const syncSourceAssociations = (file: GedcomFile, sourceId: string): number => {
  const source = file.sources.get(sourceId)
  const participants = source?.participants || []
  const principals = participants.filter(item => PRINCIPAL_ROLES.includes(item.role)).map(item => item.person)
  const wanted = new Set<string>()
  for (const item of participants) {
    const relationship = ASSOCIATION_ROLES[item.role]
    if (!relationship) continue
    for (const principal of principals) if (principal !== item.person) wanted.add(`${principal}|${item.person}|${relationship}`)
  }
  let changed = 0
  const citesSource = (citations?: GedcomSourceCitation[]) => !!citations?.some(citation => citation.xref === sourceId)
  for (const person of file.individuals.values()) {
    const before = person.associations?.length || 0
    person.associations = (person.associations || []).filter(association =>
      !citesSource(association.sourceCitations) || wanted.has(`${person.xrefId}|${association.individualXref}|${association.relationship}`))
    changed += before - person.associations.length
  }
  for (const key of wanted) {
    const [principal, other, relationship] = key.split('|') as [string, string, string]
    const person = file.individuals.get(principal)
    if (!person || !file.individuals.has(other)) continue
    const existing = person.associations.find(association => association.individualXref === other && association.relationship === relationship)
    if (existing) {
      if (!citesSource(existing.sourceCitations)) existing.sourceCitations = addCitation(existing.sourceCitations || [], { xref: sourceId })
      continue
    }
    person.associations.push({ individualXref: other, relationship, sourceCitations: [{ xref: sourceId }] })
    changed++
  }
  return changed
}

// Associations of a person in both directions: those in their record (Jan is the godparent of this child) and those
// that name them (this person is the godparent of a child)
export const associationsOfPerson = (file: GedcomFile, personId: string): { personId: string; relationship: string; reverse: boolean; sources: string[] }[] => {
  const person = file.individuals.get(personId)
  const result: { personId: string; relationship: string; reverse: boolean; sources: string[] }[] = []
  for (const association of person?.associations || []) {
    if (file.individuals.has(association.individualXref)) {
      result.push({ personId: association.individualXref, relationship: association.relationship, reverse: false, sources: (association.sourceCitations || []).map(citation => citation.xref) })
    }
  }
  for (const other of file.individuals.values()) {
    if (other.xrefId === personId) continue
    for (const association of other.associations || []) {
      if (association.individualXref === personId) result.push({ personId: other.xrefId, relationship: association.relationship, reverse: true, sources: (association.sourceCitations || []).map(citation => citation.xref) })
    }
  }
  return result
}

const eventsOfFile = (file: GedcomFile): (GedcomEvent | undefined)[] => [
  ...[...file.individuals.values()].flatMap(person => [person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events]),
  ...[...file.families.values()].flatMap(family => [family.marriage, family.divorce, ...(family.engagements || [])]),
]

// Removes a source record with every citation of it, its participants and the associations made from it
export const removeSource = (file: GedcomFile, sourceId: string) => {
  const drop = (citations?: GedcomSourceCitation[]) => {
    const kept = (citations || []).filter(citation => citation.xref !== sourceId)
    return kept.length ? kept : undefined
  }
  if (file.sources.has(sourceId)) file.sources.get(sourceId)!.participants = []
  syncSourceAssociations(file, sourceId)
  for (const person of file.individuals.values()) {
    person.sourceCitations = drop(person.sourceCitations) || []
    person.sexCitations = drop(person.sexCitations)
    for (const name of person.names) name.sourceCitations = drop(name.sourceCitations)
    for (const association of person.associations || []) association.sourceCitations = drop(association.sourceCitations)
  }
  for (const family of file.families.values()) family.sourceCitations = drop(family.sourceCitations) || []
  for (const event of eventsOfFile(file)) if (event) event.sourceCitations = drop(event.sourceCitations)
  file.sources.delete(sourceId)
  file.metadata.totalSources = file.sources.size
}

// The fields of a source record as the editor and the batch operation addSource / updateSource give them
export interface SourceFields {
  title?: string
  author?: string
  repository?: string
  repositoryUrl?: string
  publication?: string
  language?: string
  transcript?: string
  translation?: string
  // Web address of the record in the archive (a link of the source)
  url?: string
  // A file stored in the tree (media/<name>, from POST /api/media/upload or copy)
  image?: string
  verifiedBy?: string
  verifiedAt?: string
}

const clean = (value?: string): string | undefined => {
  const text = value?.replace(/\r\n?/g, '\n').trim()
  return text ? text : undefined
}

// A link (OBJE record) of the source: reuses a record with the same address or file, otherwise creates one
const ensureMedia = (file: GedcomFile, address: string, title: string): string => {
  const stored = isStored(address)
  const existing = [...file.multimedia.values()].find(media => media.file === address)
  if (existing) return existing.xrefId
  const id = nextXref(file.multimedia, 'M')
  const extension = address.split('.').pop()?.toLowerCase() || ''
  file.multimedia.set(id, { xrefId: id, file: address, title, format: stored ? (extension === 'jpg' ? 'jpeg' : extension) : 'url', notes: [], userData: {} })
  file.metadata.totalMultimedia = file.multimedia.size
  return id
}

// Writes the fields into a source record; a field that is not given stays as it is, an empty text clears it
export const applySourceFields = (file: GedcomFile, source: GedcomSource, fields: SourceFields) => {
  if (fields.title !== undefined) source.title = clean(fields.title) || ''
  if (fields.author !== undefined) source.author = clean(fields.author)
  if (fields.publication !== undefined) source.publication = clean(fields.publication)
  if (fields.repository !== undefined) source.repository = ensureRepository(file, fields.repository, clean(fields.repositoryUrl)) || undefined
  if (fields.language !== undefined) source.language = clean(fields.language)
  if (fields.transcript !== undefined) source.text = clean(fields.transcript)
  if (fields.translation !== undefined) setTranslation(source, fields.translation || '')
  if (fields.verifiedBy !== undefined) source.verifiedBy = clean(fields.verifiedBy)
  if (fields.verifiedAt !== undefined) source.verifiedAt = clean(fields.verifiedAt)
  const title = source.title || ''
  for (const address of [clean(fields.url), clean(fields.image)]) {
    if (!address) continue
    const id = ensureMedia(file, address, title)
    if (!source.multimediaLinks.includes(id)) source.multimediaLinks.push(id)
  }
}

export const createSource = (file: GedcomFile, fields: SourceFields, participants: GedcomSourceParticipant[] = []): string => {
  const id = nextXref(file.sources, 'S')
  const source = emptySource(id)
  file.sources.set(id, source)
  applySourceFields(file, source, fields)
  for (const participant of participants) addParticipant(source, participant)
  file.metadata.totalSources = file.sources.size
  syncSourceAssociations(file, id)
  return id
}

// "Convert to a source": a link (OBJE) becomes the link of a new source record. Facts that had the link as their
// source cite the record instead, people who had the link get a role in it (from the fact, otherwise "other") and the
// link moves from the person's links into the record. The OBJE record and a stored copy stay.
export const convertLinkToSource = (file: GedcomFile, mediaId: string, fields: SourceFields = {}, role?: (personId: string, factType: string) => SourceRole | null): string => {
  const media = file.multimedia.get(mediaId)
  if (!media) throw new Error(`Link ${mediaId} not found`)
  const id = createSource(file, { title: media.title || media.url || media.file || mediaId, ...fields })
  const source = file.sources.get(id)!
  if (!source.multimediaLinks.includes(mediaId)) source.multimediaLinks.unshift(mediaId)
  const cite = <T extends { multimediaLinks?: string[]; sourceCitations?: GedcomSourceCitation[] }>(holder?: T): boolean => {
    if (!holder?.multimediaLinks?.includes(mediaId)) return false
    holder.multimediaLinks = holder.multimediaLinks.filter(item => item !== mediaId)
    holder.sourceCitations = addCitation(holder.sourceCitations || [], { xref: id })
    return true
  }
  for (const person of file.individuals.values()) {
    const types: string[] = []
    for (const name of person.names) if (cite(name)) types.push('NAME')
    if (person.sexLinks?.includes(mediaId)) {
      person.sexLinks = person.sexLinks.filter(item => item !== mediaId)
      person.sexCitations = addCitation(person.sexCitations || [], { xref: id })
      types.push('SEX')
    }
    for (const event of [person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events]) if (cite(event)) types.push(event!.type)
    if (person.multimediaLinks.includes(mediaId)) {
      person.multimediaLinks = person.multimediaLinks.filter(item => item !== mediaId)
      types.push('INDI')
    }
    if (!types.length) continue
    const roles = types.map(type => role?.(person.xrefId, type) || null).filter((value): value is SourceRole => !!value)
    for (const value of roles.length ? [...new Set(roles)] : ['other' as SourceRole]) addParticipant(source, { person: person.xrefId, role: value })
  }
  for (const family of file.families.values()) {
    let cited = false
    for (const event of [family.marriage, family.divorce, ...(family.engagements || [])]) cited = cite(event) || cited
    if (family.multimediaLinks.includes(mediaId)) {
      family.multimediaLinks = family.multimediaLinks.filter(item => item !== mediaId)
      cited = true
    }
    if (!cited) continue
    if (family.husband) addParticipant(source, { person: family.husband, role: 'groom' })
    if (family.wife) addParticipant(source, { person: family.wife, role: 'bride' })
  }
  syncSourceAssociations(file, id)
  return id
}
