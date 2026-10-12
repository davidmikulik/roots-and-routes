const NUMBER = '[-+]?\\d+(?:\\.\\d+)?'
const PAIR = new RegExp(`^\\s*(${NUMBER})\\s*(?:[,;]|\\s)\\s*(${NUMBER})\\s*$`)

// Parses "48.20262283558982, 16.282248710648762" (as copied from Google/Mapy maps) into [latitude, longitude]
export function parseCoordinatePair(text: string): [number, number] | null {
  const match = PAIR.exec(text)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [latitude, longitude] : null
}
