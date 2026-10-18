import { parseGedcomName } from './names'
import { EVENT_TYPES, type ExtraTag } from './eventTypes'
import type { GedcomEvent, GedcomFile, GedcomIndividual, GedcomFamily, GedcomSource, GedcomRepository, GedcomMultimedia, GedcomNote, GedcomMetadata, GedcomLine } from '~~/types/gedcom'

// Maps are not serializable by JSON.stringify (they become {}), so GedcomFile
// must be converted to entry arrays whenever it crosses JSON (Blob storage, API).
export interface SerializedGedcomFile {
  version: string
  encoding: string
  source: string
  date: string
  copyright?: string
  individuals: [string, GedcomIndividual][]
  families: [string, GedcomFamily][]
  sources: [string, GedcomSource][]
  repositories: [string, GedcomRepository][]
  multimedia: [string, GedcomMultimedia][]
  notes: [string, GedcomNote][]
  metadata: GedcomMetadata
  rawLines?: GedcomLine[]
}

const toEntries = <T>(value: Map<string, T> | [string, T][] | undefined): [string, T][] =>
  value instanceof Map ? Array.from(value.entries()) : Array.isArray(value) ? value : []

const toMap = <T>(value: Map<string, T> | [string, T][] | undefined): Map<string, T> =>
  value instanceof Map ? value : new Map(Array.isArray(value) ? value : [])

// JSON also turns Date into an ISO string; revive the Date-typed fields
// (GedcomDate.parsed/date1/date2, GedcomEvent.sortDate, metadata.earliest/latestDate)
const DATE_KEYS = new Set(['parsed', 'date1', 'date2', 'sortDate', 'earliestDate', 'latestDate'])

const reviveDates = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (!value || typeof value !== 'object' || value instanceof Date || seen.has(value)) return value
  seen.add(value)
  if (value instanceof Map) {
    for (const item of value.values()) reviveDates(item, seen)
    return value
  }
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const field = record[key]
    if (DATE_KEYS.has(key) && typeof field === 'string') {
      const date = new Date(field)
      record[key] = Number.isNaN(date.getTime()) ? null : date
    } else if (field && typeof field === 'object') {
      reviveDates(field, seen)
    }
  }
  return value
}

export function serializeGedcomFile(file: GedcomFile): SerializedGedcomFile {
  return {
    version: file.version,
    encoding: file.encoding,
    source: file.source,
    date: new Date(file.date).toISOString(),
    copyright: file.copyright,
    individuals: toEntries(file.individuals),
    families: toEntries(file.families),
    sources: toEntries(file.sources),
    repositories: toEntries(file.repositories),
    multimedia: toEntries(file.multimedia),
    notes: toEntries(file.notes),
    metadata: file.metadata,
    rawLines: file.rawLines,
  }
}

// Data imported before names were cleaned at import time still has "Jan /Mikulik/" in `full`: parse it again
const cleanNames = (individuals: Map<string, GedcomIndividual>): Map<string, GedcomIndividual> => {
  for (const person of individuals.values()) {
    person.names = (person.names ?? []).map(name => (name.full?.includes('/') ? { ...name, ...parseGedcomName(name.full), type: name.type } : name))
  }
  return individuals
}

// Data imported before the parser was fixed has every unknown level-1 tag of a person as an "event" (MyHeritage's
// _UPD, _UID, RIN with their value in the description): move them back to userData.extraTags
const cleanFakeEvents = (individuals: Map<string, GedcomIndividual>): Map<string, GedcomIndividual> => {
  for (const person of individuals.values()) {
    const fake = (person.events ?? []).filter(event => !EVENT_TYPES.includes(event.type))
    if (fake.length) {
      person.events = person.events.filter(event => EVENT_TYPES.includes(event.type))
      person.userData = person.userData ?? {}
      const extraTags: ExtraTag[] = person.userData.extraTags ||= []
      for (const event of fake) extraTags.push({ tag: event.type, value: event.description || event.date?.raw || '' })
    }
    for (const event of [person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events]) cleanEventLineValue(event)
  }
  return individuals
}

// The same old parser read the value on an event line as a date and a description: "1 DEAT Y" got the date and
// the description "Y", "1 EDUC Some school" a "date" with the school name. A real date comes from a DATE sub-line
// and differs from the description; a copy without a year is dropped
const cleanEventLineValue = (event?: GedcomEvent) => {
  if (!event) return
  if (event.date && event.date.raw === event.description && !/\b\d{4}\b/.test(event.date.raw)) delete event.date
  if (event.description === 'Y') event.description = ''
  // Older imports also put values of MyHeritage's helper tags into events: record ids ("MH:I500003", RIN), unique
  // ids ("68222EF534C001CE8E19260794201B0B", _UID) and the time of the last change ("12 OCT 2026 15:12:48 GMT -0500",
  // _UPD). They are not dates or descriptions and are dropped.
  if (event.date && !isPlausibleDate(event.date.raw)) delete event.date
  if (event.description && isHelperValue(event.description)) event.description = ''
}

// MyHeritage record ids and unique ids
const isHelperValue = (value: string): boolean => {
  const text = value.trim()
  return /^MH:[A-Z]{1,3}\d+$/i.test(text) || /^[0-9A-F]{32}$/i.test(text) || /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(text)
}

// Not a date: an id, or a time of day ("12 OCT 2026 15:12:48 GMT -0500" is a change stamp). Date phrases without a
// year are kept.
export const isPlausibleDate = (raw = ''): boolean => !/\d{1,2}:\d{2}/.test(raw) && !isHelperValue(raw)

const cleanFamilyEvents = (families: Map<string, GedcomFamily>): Map<string, GedcomFamily> => {
  for (const family of families.values()) for (const event of [family.marriage, family.divorce, ...(family.engagements || [])]) cleanEventLineValue(event)
  return families
}

export function deserializeGedcomFile(serialized: SerializedGedcomFile): GedcomFile {
  return {
    version: serialized.version,
    encoding: serialized.encoding,
    source: serialized.source,
    date: new Date(serialized.date),
    copyright: serialized.copyright,
    individuals: cleanFakeEvents(cleanNames(reviveDates(toMap(serialized.individuals)))),
    families: cleanFamilyEvents(reviveDates(toMap(serialized.families))),
    sources: toMap(serialized.sources),
    repositories: toMap(serialized.repositories),
    multimedia: toMap(serialized.multimedia),
    notes: toMap(serialized.notes),
    metadata: reviveDates(serialized.metadata),
    rawLines: serialized.rawLines,
  }
}
