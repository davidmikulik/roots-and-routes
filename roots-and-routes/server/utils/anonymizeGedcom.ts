// Anonymized copy of the tree for visitors who are not logged in as administrator (GET /api/gedcom/get).
// The same rules as the display-only anonymous mode (composables/useAnonymize.ts): names → initials, dates → year,
// places hidden. On top of that everything else that could identify a person is dropped: coordinates (so the map
// is empty), addresses, notes, sources, multimedia, attributes and free-text fields. Structure stays: ids, sex,
// families, parents and children, event types, so the tree and the graph still work.
import type { GedcomDate, GedcomEvent, GedcomFamily, GedcomFile, GedcomIndividual, GedcomName } from '~~/types/gedcom'
import { primaryNameOf } from '~~/utils/gedcom/names'

const initials = (value = ''): string =>
  value.replace(/[/]/g, ' ').split(/\s+/).filter(Boolean).map(part => `${part[0]!.toUpperCase()}.`).join(' ')

const anonymizeName = (name: GedcomName): GedcomName => ({
  full: initials(name.full) || '?',
  given: initials(name.given),
  surname: initials(name.surname),
})

// Only the year is kept. A Date in the middle of the year, so no time zone can move it into another year.
const yearDate = (year: number, original?: Date | null): Date | null | undefined =>
  original ? new Date(Date.UTC(year, 6, 1)) : original

const anonymizeDate = (date?: GedcomDate): GedcomDate | undefined => {
  const yearText = date?.raw.match(/\b\d{4}\b/)?.[0]
  if (!date || !yearText) return undefined
  const year = Number(yearText)
  return { raw: yearText, year, parsed: yearDate(year, date.parsed), date1: yearDate(year, date.date1), date2: yearDate(year, date.date2) }
}

const anonymizeEvent = (event?: GedcomEvent): GedcomEvent | undefined => {
  if (!event) return undefined
  const date = anonymizeDate(event.date)
  return { type: event.type, date, sortDate: date?.parsed ?? undefined }
}

const anonymizeEvents = (events?: GedcomEvent[]): GedcomEvent[] | undefined =>
  events?.map(event => anonymizeEvent(event)!)

const anonymizeIndividual = (person: GedcomIndividual): GedcomIndividual => ({
  xrefId: person.xrefId,
  // Only the name the person is shown under (married name, otherwise birth name), as initials
  names: primaryNameOf(person.names) ? [anonymizeName(primaryNameOf(person.names)!)] : [],
  sex: person.sex,
  birth: anonymizeEvent(person.birth),
  baptism: anonymizeEvent(person.baptism),
  christening: anonymizeEvent(person.christening),
  death: anonymizeEvent(person.death),
  burial: anonymizeEvent(person.burial),
  cremation: anonymizeEvent(person.cremation),
  marriages: anonymizeEvents(person.marriages),
  divorces: anonymizeEvents(person.divorces),
  engagements: anonymizeEvents(person.engagements),
  events: anonymizeEvents(person.events) ?? [],
  familiesAsChild: [...person.familiesAsChild],
  familiesAsSpouse: [...person.familiesAsSpouse],
  associations: [],
  multimediaLinks: [],
  notes: [],
  sourceCitations: [],
  attributes: {},
  userData: {},
})

const anonymizeFamily = (family: GedcomFamily): GedcomFamily => ({
  xrefId: family.xrefId,
  husband: family.husband,
  wife: family.wife,
  children: [...family.children],
  marriage: anonymizeEvent(family.marriage),
  divorce: anonymizeEvent(family.divorce),
  engagements: anonymizeEvents(family.engagements),
  childCount: family.childCount,
  notes: [],
  sourceCitations: [],
  multimediaLinks: [],
  userData: {},
})

export function anonymizeGedcomFile(file: GedcomFile): GedcomFile {
  return {
    version: file.version,
    encoding: file.encoding,
    source: file.source,
    date: file.date,
    individuals: new Map([...file.individuals].map(([id, person]) => [id, anonymizeIndividual(person)])),
    families: new Map([...file.families].map(([id, family]) => [id, anonymizeFamily(family)])),
    sources: new Map(),
    repositories: new Map(),
    multimedia: new Map(),
    notes: new Map(),
    metadata: { ...file.metadata, totalSources: 0, totalRepositories: 0, totalMultimedia: 0, totalNotes: 0 },
  }
}
