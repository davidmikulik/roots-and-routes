export interface KnownLocation {
  name: string
  latitude: number | null
  longitude: number | null
}

export interface GedcomLocationSummary {
  unique: string[]
  matched: KnownLocation[]
  unresolved: string[]
}
