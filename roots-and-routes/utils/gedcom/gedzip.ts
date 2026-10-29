// Downloading a tree in the browser: a plain .ged file, or with attachments a ZIP in the GEDZIP layout (GEDCOM 7):
// gedcom.ged plus media/<name>, which is where FILE media/<name> in the tree points. Used by the export of the tree
// (useGedcomStore().downloadGedcom) and of a backup (Settings → Data and backups).
import { parseGedcom } from '~~/utils/gedcom/parser'

// Attachments stored in the tree (FILE media/<name>, see server/utils/media.ts)
export const storedMediaPaths = (files: (string | undefined)[]): string[] =>
  [...new Set(files.filter((file): file is string => !!file && /^media\/[0-9a-f-]{36}\.[a-z]{3,4}$/.test(file)))]

// The attachments a GEDCOM text links to
export const storedMediaOfText = (text: string): string[] =>
  storedMediaPaths([...parseGedcom(text, { resolveXrefs: false, extractCoordinates: false }).file.multimedia.values()].map(media => media.file))

// Saves a blob as a file in the browser
export const saveBlob = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Downloads `text` as <name>.ged, or with its attachments as <name>.zip. `fetchMedia` loads one attachment
// (media/<name>); those that cannot be loaded are left out and returned.
export async function downloadGedcomText(
  text: string,
  name: string,
  media: string[],
  fetchMedia: (path: string) => Promise<Blob>,
): Promise<{ attachments: number; missing: string[] }> {
  if (!media.length) {
    saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${name}.ged`)
    return { attachments: 0, missing: [] }
  }
  const { zipSync, strToU8 } = await import('fflate')
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { 'gedcom.ged': strToU8(text) }
  const missing: string[] = []
  for (const path of media) {
    try {
      // Images and PDFs are compressed already
      entries[path] = [new Uint8Array(await (await fetchMedia(path)).arrayBuffer()), { level: 0 }]
    } catch (error) {
      console.error(`[GEDCOM] Attachment ${path} could not be downloaded:`, error)
      missing.push(path)
    }
  }
  saveBlob(new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${name}.zip`)
  return { attachments: media.length - missing.length, missing }
}
