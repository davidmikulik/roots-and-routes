// Vercel Blob Storage Utilities
import { put, get, del, list, head } from '@vercel/blob'
import type { GedcomFile, GedcomParseResult, UploadedFile } from '~/types'

const config = useRuntimeConfig()
const getBlobToken = (): string => config.vercelBlob?.token || process.env.BLOB_READ_WRITE_TOKEN || ''
const getUploadDir = (): string => config.gedcom?.uploadDir || 'uploads/gedcom'

export async function uploadGedcomFile(file: Buffer | string, filename: string, options: { userId?: string; overwrite?: boolean; metadata?: Record<string, string> } = {}): Promise<UploadedFile> {
  const { userId, overwrite, metadata } = options
  const extension = filename.split('.').pop() || 'ged'
  const uniqueId = crypto.randomUUID()
  const storageFilename = userId ? `${getUploadDir()}/${userId}/${uniqueId}.${extension}` : `${getUploadDir()}/${uniqueId}.${extension}`
  let content: Buffer | string = typeof file === 'string' ? file : file
  await put(storageFilename, content, { token: getBlobToken(), addRandomSuffix: !overwrite, ...metadata })
  const blob = await get(storageFilename, { token: getBlobToken() })
  const size = typeof file === 'string' ? Buffer.byteLength(content as string) : (content as Buffer).byteLength
  return {
    id: uniqueId, name: filename, originalName: filename, size,
    mimeType: filename.endsWith('.ged') || filename.endsWith('.gedcom') ? 'application/octet-stream' : 'text/plain',
    extension, path: storageFilename, url: blob.url,
    createdAt: new Date(), updatedAt: new Date(), uploadedBy: userId, status: 'ready',
  }
}

export async function downloadFile(path: string): Promise<Buffer> {
  const blob = await get(path, { token: getBlobToken() })
  return Buffer.from(await blob.arrayBuffer())
}

export async function getFileText(path: string): Promise<string> {
  const blob = await get(path, { token: getBlobToken() })
  return await blob.text()
}

export async function getFileMetadata(path: string) {
  return await head(path, { token: getBlobToken() })
}

export async function deleteFile(path: string): Promise<boolean> {
  try { await del(path, { token: getBlobToken() }); return true } catch (error) { console.error('Failed to delete file:', error); return false }
}

export async function listFiles(prefix: string = ''): Promise<string[]> {
  const { objects } = await list({ prefix, token: getBlobToken() })
  return objects.map(obj => obj.path)
}

export async function listUserFiles(userId?: string): Promise<UploadedFile[]> {
  const prefix = userId ? `${getUploadDir()}/${userId}` : getUploadDir()
  const { objects } = await list({ prefix, token: getBlobToken() })
  return objects.map(obj => ({
    id: obj.path.split('/').pop()?.replace('.ged', '').replace('.gedcom', '') || '',
    name: obj.path.split('/').pop() || '',
    originalName: (obj.metadata?.originalName as string) || obj.path.split('/').pop() || '',
    size: obj.size, mimeType: obj.contentType || 'application/octet-stream',
    extension: obj.path.endsWith('.ged') ? 'ged' : 'gedcom',
    path: obj.path, url: obj.url,
    createdAt: obj.uploadedAt ? new Date(obj.uploadedAt) : new Date(),
    updatedAt: obj.uploadedAt ? new Date(obj.uploadedAt) : new Date(),
    uploadedBy: userId, status: 'ready',
  }))
}

export async function fileExists(path: string): Promise<boolean> {
  try { await head(path, { token: getBlobToken() }); return true } catch (error) { return false }
}

export async function saveParsedGedcom(data: GedcomFile, fileId: string, userId?: string): Promise<string> {
  const jsonString = JSON.stringify(data)
  const path = userId ? `${getUploadDir()}/${userId}/parsed/${fileId}.json` : `${getUploadDir()}/parsed/${fileId}.json`
  await put(path, jsonString, { token: getBlobToken(), contentType: 'application/json' })
  return path
}

export async function loadParsedGedcom(fileId: string, userId?: string): Promise<GedcomFile | null> {
  const path = userId ? `${getUploadDir()}/${userId}/parsed/${fileId}.json` : `${getUploadDir()}/parsed/${fileId}.json`
  try { const content = await getFileText(path); return JSON.parse(content) as GedcomFile } catch (error) { console.error('Failed to load parsed GEDCOM:', error); return null }
}

export async function saveExportedGedcom(content: string, filename: string, userId?: string): Promise<UploadedFile> {
  const uniqueId = crypto.randomUUID()
  const path = userId ? `${getUploadDir()}/${userId}/exports/${uniqueId}.ged` : `${getUploadDir()}/exports/${uniqueId}.ged`
  await put(path, content, { token: getBlobToken(), contentType: 'application/octet-stream' })
  const blob = await get(path, { token: getBlobToken() })
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
