// Vercel Blob Storage Utilities
import { put, get, del, list, head } from '@vercel/blob'
import type { GedcomFile } from '~~/types'
import { serializeGedcomFile, deserializeGedcomFile, type SerializedGedcomFile } from '~~/utils/gedcom/serialize'

const getBlobToken = (): string => 
  useRuntimeConfig().vercelBlob?.token || 
  process.env.BLOB_READ_WRITE_TOKEN || 
  process.env.ADMIN_API_TOKEN || 
  process.env.API_TOKEN || 
  ''
const getUploadDir = (): string => useRuntimeConfig().gedcom?.uploadDir || 'uploads/gedcom'
const requireBlobToken = (): string => {
  const token = getBlobToken()
  if (!token) throw createError({ statusCode: 503, statusMessage: 'BLOB_READ_WRITE_TOKEN is not configured' })
  return token
}

// The original GEDCOM text of a database (paths from databasePaths() in server/utils/access.ts)
export async function saveOriginalGedcom(path: string, content: Buffer | string): Promise<void> {
  await put(path, content, { access: 'private', token: requireBlobToken(), contentType: 'application/octet-stream', addRandomSuffix: false, allowOverwrite: true })
}

// The original GEDCOM text, also under the older extension .gedcom; null when there is none
export async function readOriginalGedcom(path: string): Promise<string | null> {
  for (const candidate of [path, path.replace(/\.ged$/, '.gedcom')]) {
    const blob = await get(candidate, { access: 'private', token: requireBlobToken(), useCache: false })
    if (blob?.stream) return await new Response(blob.stream).text()
  }
  return null
}

export async function downloadFile(path: string): Promise<Buffer> {
  const blob = await get(path, { access: 'private', token: requireBlobToken() })
  if (!blob?.stream) throw createError({ statusCode: 404, statusMessage: 'Blob not found' })
  return Buffer.from(await new Response(blob.stream).arrayBuffer())
}

export async function getFileText(path: string): Promise<string> {
  const blob = await get(path, { access: 'private', token: requireBlobToken() })
  if (!blob?.stream) throw createError({ statusCode: 404, statusMessage: 'Blob not found' })
  return await new Response(blob.stream).text()
}

export async function getFileMetadata(path: string) {
  return await head(path, { token: requireBlobToken() })
}

export async function deleteFile(path: string): Promise<boolean> {
  try { await del(path, { token: requireBlobToken() }); return true } catch (error) { console.error('Failed to delete file:', error); return false }
}

export async function listFiles(prefix: string = ''): Promise<string[]> {
  const { blobs } = await list({ prefix, token: requireBlobToken() })
  return blobs.map(blob => blob.pathname)
}

// list() returns at most 1000 blobs per call
export async function listAllBlobs(prefix: string) {
  const blobs: Awaited<ReturnType<typeof list>>['blobs'] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix, cursor, token: requireBlobToken() })
    blobs.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

export async function fileExists(path: string): Promise<boolean> {
  try { await head(path, { token: getBlobToken() }); return true } catch (error) { return false }
}

export async function saveParsedGedcom(data: GedcomFile, path: string): Promise<string> {
  const jsonString = JSON.stringify(serializeGedcomFile(data))
  await put(path, jsonString, { access: 'private', token: requireBlobToken(), contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
  return path
}

// null when the file is missing or in the old format (Maps saved as {}), see get.get.ts
export async function loadParsedGedcom(path: string): Promise<GedcomFile | null> {
  try {
    const blob = await get(path, { access: 'private', token: requireBlobToken(), useCache: false })
    if (!blob?.stream) return null
    const serialized = JSON.parse(await new Response(blob.stream).text()) as SerializedGedcomFile
    // If individuals/families are arrays, it's the new format; objects are the old broken one (Maps were lost)
    if (serialized.individuals && typeof serialized.individuals === 'object' && !Array.isArray(serialized.individuals)) {
      console.log(`[STORAGE] Detected old format of ${path}, the original GEDCOM has to be parsed again`)
      return null
    }
    return deserializeGedcomFile(serialized)
  } catch (error) {
    console.error('Failed to load parsed GEDCOM:', error)
    return null
  }
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\:*?"<>|]/g, '').replace(/\s+/g, '_').trim()
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

export function isGedcomFile(filename: string): boolean {
  const ext = getFileExtension(filename).toLowerCase()
  return ext === 'ged' || ext === 'gedcom'
}

export function validateFileSize(size: number, maxSize: number = 10 * 1024 * 1024): { valid: boolean; message?: string } {
  if (size <= 0) return { valid: false, message: 'File is empty' }
  if (size > maxSize) return { valid: false, message: `File is too large. Maximum size is ${formatFileSize(maxSize)}` }
  return { valid: true }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export { getBlobToken, getUploadDir, requireBlobToken }
