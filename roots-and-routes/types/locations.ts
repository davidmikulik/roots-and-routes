export interface KnownLocation {
  name: string
  latitude: number
  longitude: number
}

export interface GedcomLocationSummary {
  unique: string[]
  matched: KnownLocation[]
  unresolved: string[]
}
