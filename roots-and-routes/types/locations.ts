export interface KnownLocation {
  name: string
  latitude: number | null
  longitude: number | null
  // Links about the place: any web page, ČÚZK archive sheets get a descriptive label (utils/gedcom/archiveMaps.ts).
  // The field keeps its old name, the stored catalog uses it.
  archiveMaps?: ArchiveMap[]
  // Scanned map sheets the user uploaded (bought copies) and georeferenced onto the map
  overlays?: MapOverlay[]
}

// A link of a place: any http(s) address, e.g. a sheet in the ČÚZK archive viewer
// (https://ags.cuzk.gov.cz/archiv/openmap.html?typ=ciom&idrastru=…); the title is optional
export interface ArchiveMap {
  url: string
  title?: string
}

// A georeferenced scanned sheet. The image is in the private Blob store (media/<uuid>.<ext>); the control points
// map a pixel (px, py from the top left) to web Mercator (x, y) and an affine transform is fitted from them.
export interface MapOverlay {
  id: string
  file: string
  title: string
  // Citation of the source (archive, kind of map, signature); shown with the overlay
  source?: string
  width: number
  height: number
  points: OverlayPoint[]
}

export interface OverlayPoint {
  px: number
  py: number
  x: number
  y: number
}

export interface GedcomLocationSummary {
  unique: string[]
  matched: KnownLocation[]
  unresolved: string[]
}
