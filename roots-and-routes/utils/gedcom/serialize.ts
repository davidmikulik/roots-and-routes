import { parseGedcomName } from './names'
import type { GedcomFile, GedcomIndividual, GedcomFamily, GedcomSource, GedcomRepository, GedcomMultimedia, GedcomNote, GedcomMetadata, GedcomLine } from '~~/types/gedcom'

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

export function deserializeGedcomFile(serialized: SerializedGedcomFile): GedcomFile {
  return {
    version: serialized.version,
    encoding: serialized.encoding,
    source: serialized.source,
    date: new Date(serialized.date),
    copyright: serialized.copyright,
    individuals: cleanNames(reviveDates(toMap(serialized.individuals))),
    families: reviveDates(toMap(serialized.families)),
    sources: toMap(serialized.sources),
    repositories: toMap(serialized.repositories),
    multimedia: toMap(serialized.multimedia),
    notes: toMap(serialized.notes),
    metadata: reviveDates(serialized.metadata),
    rawLines: serialized.rawLines,
  }
}
