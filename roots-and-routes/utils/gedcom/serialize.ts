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

export function deserializeGedcomFile(serialized: SerializedGedcomFile): GedcomFile {
  return {
    version: serialized.version,
    encoding: serialized.encoding,
    source: serialized.source,
    date: new Date(serialized.date),
    copyright: serialized.copyright,
    individuals: toMap(serialized.individuals),
    families: toMap(serialized.families),
    sources: toMap(serialized.sources),
    repositories: toMap(serialized.repositories),
    multimedia: toMap(serialized.multimedia),
    notes: toMap(serialized.notes),
    metadata: serialized.metadata,
    rawLines: serialized.rawLines,
  }
}
