// Georeferencing of a scanned map sheet the user uploaded (a bought copy; the app never downloads it from anywhere).
// From control points — a spot clicked both on the sheet (pixel px, py from the top left) and on the current map
// (web Mercator x, y) — a least-squares affine transform pixel → map is computed:
//   X = a·px + b·py + c
//   Y = d·px + e·py + f
// Affine (not just rotation+scale) also absorbs the small shear of a scan. It needs at least 3 non-collinear points.

export interface ControlPoint {
  // Pixel on the sheet, from the top left
  px: number
  py: number
  // Web Mercator (EPSG:3857)
  x: number
  y: number
}

// [a, b, c, d, e, f]
export type Affine = [number, number, number, number, number, number]

// Solves the 6×6 normal equations of the least-squares fit; null when the points are collinear (singular)
export function affineFromPoints(points: ControlPoint[]): Affine | null {
  if (points.length < 3) return null
  // Normal equations for [a b c] (X) and [d e f] (Y) share the same 3×3 matrix M = Σ [px py 1]ᵀ[px py 1]
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const bx = [0, 0, 0]
  const by = [0, 0, 0]
  for (const p of points) {
    const row = [p.px, p.py, 1]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i]![j]! += row[i]! * row[j]!
      bx[i]! += row[i]! * p.x
      by[i]! += row[i]! * p.y
    }
  }
  const inv = invert3(m)
  if (!inv) return null
  const solve = (b: number[]) => [0, 1, 2].map(i => inv[i]![0]! * b[0]! + inv[i]![1]! * b[1]! + inv[i]![2]! * b[2]!)
  const [a, b, c] = solve(bx)
  const [d, e, f] = solve(by)
  return [a!, b!, c!, d!, e!, f!]
}

export const applyAffine = (t: Affine, px: number, py: number): [number, number] =>
  [t[0] * px + t[1] * py + t[2], t[3] * px + t[4] * py + t[5]]

// Inverse affine (map → pixel); null when the transform is degenerate
export function invertAffine(t: Affine): Affine | null {
  const [a, b, c, d, e, f] = t
  const det = a * e - b * d
  if (Math.abs(det) < 1e-12) return null
  const ia = e / det
  const ib = -b / det
  const id = -d / det
  const ie = a / det
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)]
}

// Residual of each control point in metres (how far the fitted sheet puts the point from where it was clicked)
export function residuals(t: Affine, points: ControlPoint[]): number[] {
  return points.map((p) => {
    const [x, y] = applyAffine(t, p.px, p.py)
    return Math.hypot(x - p.x, y - p.y)
  })
}

// 3×3 inverse by cofactors; null when singular
function invert3(m: number[][]): number[][] | null {
  const [a, b, c] = m[0]!
  const [d, e, f] = m[1]!
  const [g, h, i] = m[2]!
  const A = e! * i! - f! * h!
  const B = -(d! * i! - f! * g!)
  const C = d! * h! - e! * g!
  const det = a! * A + b! * B + c! * C
  if (Math.abs(det) < 1e-9) return null
  return [
    [A / det, (c! * h! - b! * i!) / det, (b! * f! - c! * e!) / det],
    [B / det, (a! * i! - c! * g!) / det, (c! * d! - a! * f!) / det],
    [C / det, (b! * g! - a! * h!) / det, (a! * e! - b! * d!) / det],
  ]
}
