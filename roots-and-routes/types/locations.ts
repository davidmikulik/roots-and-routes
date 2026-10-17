export interface KnownLocation {
  name: string
  latitude: number | null
  longitude: number | null
  // Sheets of historical maps in the ČÚZK archive viewer (císařské otisky, originální mapy stabilního katastru…)
  archiveMaps?: ArchiveMap[]
}

// A link to one sheet in the ČÚZK archive viewer: https://ags.cuzk.gov.cz/archiv/openmap.html?typ=ciom&idrastru=…
export interface ArchiveMap {
  url: string
}

export interface GedcomLocationSummary {
  unique: string[]
  matched: KnownLocation[]
  unresolved: string[]
}
