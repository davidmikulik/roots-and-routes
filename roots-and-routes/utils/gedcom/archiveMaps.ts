// Links of a known location (Admin → Known locations): any web page about the place (a map portal, a chronicle…),
// and sheets in the ČÚZK archive viewer (Ústřední archiv zeměměřictví a katastru) get a descriptive label.
// Only links: the ČÚZK scans are a paid product of the archive and its viewer needs a token, so the app does not
// download them. Publishing a reproduction is free, but the source must be cited (archive, kind of map, signature).

export const ARCHIVE_HOSTS = ['ags.cuzk.gov.cz', 'ags.cuzk.cz']
// Kinds of maps by the viewer's `typ` parameter; anything else is shown as a generic archival map
export const ARCHIVE_MAP_TYPES = ['cioc', 'ciom', 'orm'] as const
export type ArchiveMapType = typeof ARCHIVE_MAP_TYPES[number] | 'other'

export interface ParsedArchiveMap {
  url: string
  type: ArchiveMapType
  typeCode: string
  sheet: string
}

// Accepts a link copied from the viewer (also "Sdílet archiválii" with extent, brightness…); keeps only typ and
// idrastru so a token or a view in the link is not stored
export function parseArchiveMapUrl(value: string): ParsedArchiveMap | null {
  let url: URL
  try { url = new URL(value.trim()) } catch { return null }
  if (url.protocol !== 'https:' || !ARCHIVE_HOSTS.includes(url.hostname) || url.pathname !== '/archiv/openmap.html') return null
  const typeCode = url.searchParams.get('typ') || ''
  const sheet = url.searchParams.get('idrastru') || ''
  if (!/^[a-z0-9_]{2,20}$/i.test(typeCode) || !/^[A-Za-z0-9_.-]{3,80}$/.test(sheet)) return null
  const clean = `https://ags.cuzk.gov.cz/archiv/openmap.html?typ=${encodeURIComponent(typeCode)}&idrastru=${encodeURIComponent(sheet)}`
  const type = (ARCHIVE_MAP_TYPES as readonly string[]).includes(typeCode) ? typeCode as ArchiveMapType : 'other'
  return { url: clean, type, typeCode, sheet }
}

// A place link ready to show: the ČÚZK sheet when the URL is one, otherwise just the host for the label
export interface ParsedPlaceLink {
  url: string
  title?: string
  archive: ParsedArchiveMap | null
  host: string
}

export const PLACE_LINK_MAX_URL = 2000
export const PLACE_LINK_MAX_TITLE = 200

// Accepts any http(s) address; a ČÚZK archive link is stored cleaned (see parseArchiveMapUrl). The title is optional.
export function parsePlaceLink(value: string, title?: string): ParsedPlaceLink | null {
  const text = (value || '').trim()
  if (!text || text.length > PLACE_LINK_MAX_URL) return null
  let url: URL
  try { url = new URL(text) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const archive = parseArchiveMapUrl(text)
  const cleanTitle = (title || '').trim().slice(0, PLACE_LINK_MAX_TITLE)
  return { url: archive?.url ?? url.href, ...(cleanTitle ? { title: cleanTitle } : {}), archive, host: url.hostname.replace(/^www\./, '') }
}
