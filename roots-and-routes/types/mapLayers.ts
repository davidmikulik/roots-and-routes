// Custom historical map layers (Admin → Map layers, docs/vlastni-vrstvy-navrh.md). A layer is a named set of scanned
// sheets the administrator uploaded (bought copies); each sheet is georeferenced by its own control points.
// Stored in the private Blob store as uploads/gedcom/map-layers.json.
export interface CustomLayer {
  id: string
  title: string
  sheets: MapSheet[]
}

// The image is in the private Blob store (media/<uuid>.<ext>); the control points map a pixel (px, py from the top
// left) to web Mercator (x, y) and an affine transform is fitted from them (utils/map/affine.ts)
export interface MapSheet {
  id: string
  file: string
  title: string
  // Citation of the source (archive, kind of map, signature)
  source?: string
  width: number
  height: number
  points: ControlPoint[]
}

export interface ControlPoint {
  px: number
  py: number
  x: number
  y: number
}
