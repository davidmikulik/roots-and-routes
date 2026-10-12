// Vercel Blob Storage Utilities
import { put, get, del, list, head } from '@vercel/blob'
import type { GedcomFile, UploadedFile } from '~~/types'
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

export async function uploadGedcomFile(file: Buffer | string, filename: string, options: { userId?: string; overwrite?: boolean; fileId?: string; metadata?: Record<string, string> } = {}): Promise<UploadedFile> {
  const { userId, overwrite, fileId, metadata } = options
  const extension = filename.split('.').pop() || 'ged'
  const uniqueId = fileId || crypto.randomUUID()
  const storageFilename = userId ? `${getUploadDir()}/${userId}/${uniqueId}.${extension}` : `${getUploadDir()}/${uniqueId}.${extension}`
  const token = requireBlobToken()
  let content: Buffer | string = typeof file === 'string' ? file : file
  const blob = await put(storageFilename, content, { access: 'private', token, addRandomSuffix: false, allowOverwrite: overwrite, ...metadata })
  const size = typeof file === 'string' ? Buffer.byteLength(content as string) : (content as Buffer).byteLength
  return {
    id: uniqueId, name: filename, originalName: filename, size,
    mimeType: filename.endsWith('.ged') || filename.endsWith('.gedcom') ? 'application/octet-stream' : 'text/plain',
    extension, path: storageFilename, url: blob.url,
    createdAt: new Date(), updatedAt: new Date(), uploadedBy: userId, status: 'ready',
  }
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

export async function listUserFiles(userId?: string): Promise<UploadedFile[]> {
  const prefix = userId ? `${getUploadDir()}/${userId}` : getUploadDir()
  const { blobs } = await list({ prefix, token: requireBlobToken() })
  return blobs.map(blob => ({
    id: blob.pathname.split('/').pop()?.replace('.ged', '').replace('.gedcom', '') || '',
    name: blob.pathname.split('/').pop() || '',
    originalName: blob.pathname.split('/').pop() || '',
    size: blob.size, mimeType: 'application/octet-stream',
    extension: blob.pathname.endsWith('.ged') ? 'ged' : 'gedcom',
    path: blob.pathname, url: blob.url,
    createdAt: blob.uploadedAt ? new Date(blob.uploadedAt) : new Date(),
    updatedAt: blob.uploadedAt ? new Date(blob.uploadedAt) : new Date(),
    uploadedBy: userId, status: 'ready',
  }))
}

export async function fileExists(path: string): Promise<boolean> {
  try { await head(path, { token: getBlobToken() }); return true } catch (error) { return false }
}

export async function saveParsedGedcom(data: GedcomFile, fileId: string, userId?: string): Promise<string> {
  const token = requireBlobToken()
  const serialized = serializeGedcomFile(data)
  const jsonString = JSON.stringify(serialized)
  const path = userId ? `${getUploadDir()}/${userId}/parsed/${fileId}.json` : `${getUploadDir()}/parsed/${fileId}.json`
  await put(path, jsonString, { access: 'private', token, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true })
  return path
}

export async function loadParsedGedcom(fileId: string, userId?: string): Promise<GedcomFile | null> {
  const path = userId ? `${getUploadDir()}/${userId}/parsed/${fileId}.json` : `${getUploadDir()}/parsed/${fileId}.json`
  try {
    const content = await getFileText(path)
    const serialized = JSON.parse(content) as SerializedGedcomFile
    
    // Check if this is old format (Maps serialized as empty objects)
    // If individuals/families are arrays, it's the new format
    // If they're objects, it's the old broken format
    if (serialized.individuals && typeof serialized.individuals === 'object' && !Array.isArray(serialized.individuals)) {
      console.log(`[STORAGE] Detected old format for ${fileId}, attempting to recover...`)
      // Try to parse as old format - but this won't work as Maps were lost
      // The best approach is to re-parse the original GEDCOM file
      return null
    }
    
    return deserializeGedcomFile(serialized)
  } catch (error) {
    console.error('Failed to load parsed GEDCOM:', error)
    return null
  }
}

export async function saveExportedGedcom(content: string, filename: string, userId?: string): Promise<UploadedFile> {
  const uniqueId = crypto.randomUUID()
  const path = userId ? `${getUploadDir()}/${userId}/exports/${uniqueId}.ged` : `${getUploadDir()}/exports/${uniqueId}.ged`
  const blob = await put(path, content, { access: 'private', token: requireBlobToken(), contentType: 'application/octet-stream' })
  return {
    id: uniqueId, name: filename, originalName: filename, size: content.length,
    mimeType: 'application/octet-stream', extension: 'ged', path, url: blob.url,
    createdAt: new Date(), updatedAt: new Date(), uploadedBy: userId, status: 'ready',
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

export { getBlobToken, getUploadDir }
