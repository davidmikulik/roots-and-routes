export interface KnownLocation {
  name: string
  latitude: number | null
  longitude: number | null
  // Links about the place: any web page, ČÚZK archive sheets get a descriptive label (utils/gedcom/archiveMaps.ts).
  // The field keeps its old name, the stored catalog uses it.
  archiveMaps?: ArchiveMap[]
}

// A link of a place: any http(s) address, e.g. a sheet in the ČÚZK archive viewer
// (https://ags.cuzk.gov.cz/archiv/openmap.html?typ=ciom&idrastru=…); the title is optional
export interface ArchiveMap {
  url: string
  title?: string
}

export interface GedcomLocationSummary {
  unique: string[]
  matched: KnownLocation[]
  unresolved: string[]
}
