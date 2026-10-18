// Builds an OpenLayers image layer from a georeferenced overlay. The sheet lives in its own pixel projection and is
// reprojected to web Mercator through the affine fitted from the control points (utils/map/affine.ts).
// Client only (imports OpenLayers); used by EventMap.client.vue and the georeferencing editor.
import ImageLayer from 'ol/layer/Image'
import Static from 'ol/source/ImageStatic'
import Projection from 'ol/proj/Projection'
import { addCoordinateTransforms } from 'ol/proj'
import type { ControlPoint } from '~~/types/mapLayers'
import { affineFromPoints, applyAffine, invertAffine } from '~~/utils/map/affine'

export function createOverlayImageLayer(points: ControlPoint[], width: number, height: number, url: string): ImageLayer<Static> | null {
  const forward = affineFromPoints(points)
  if (!forward) return null
  const inverse = invertAffine(forward)
  if (!inverse) return null
  // Image coordinates: x = column, y = -row (y up), so a pixel (px, py) sits at (px, -py)
  const code = `overlay:${Math.round(forward[0] * 1e6)}:${Math.round(forward[2])}:${Math.round(forward[5])}`
  const extent: [number, number, number, number] = [0, -height, width, 0]
  const projection = new Projection({ code, units: 'pixels', extent })
  addCoordinateTransforms('EPSG:3857', projection,
    ([x, y]) => { const [px, py] = applyAffine(inverse, x!, y!); return [px, -py] },
    ([ix, iy]) => applyAffine(forward, ix!, -iy!),
  )
  return new ImageLayer({ source: new Static({ url, projection, imageExtent: extent }) })
}
