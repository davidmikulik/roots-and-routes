// Copies of linked images and documents stored in the tree (button "Zkopírovat" in the person editor).
// The server downloads the file itself, so the URL is checked first: http(s) only, no addresses of private networks
// (also after every redirect), a size limit and an allow-list of image and document types.
import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { put, get } from '@vercel/blob'
import { MEDIA_BY_EXTENSION, MEDIA_TYPES, type MediaKind } from '~~/utils/gedcom/mediaTypes'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 20_000

const TYPES = MEDIA_TYPES
const BY_EXTENSION = MEDIA_BY_EXTENSION
// For direct uploads of attachments (a backup uploaded from the disk)
export const MEDIA_CONTENT_TYPES = Object.keys(MEDIA_TYPES)

export interface CopiedMedia {
  file: string
  format: string
  kind: MediaKind
  contentType: string
  size: number
}

const isPrivateAddress = (address: string): boolean => {
  if (isIP(address) === 6) {
    const lower = address.toLowerCase()
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower)
  }
  const [a, b] = address.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a! >= 224
}

const checkUrl = async (raw: string): Promise<URL> => {
  let url: URL
  try { url = new URL(raw) } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid URL' }) }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw createError({ statusCode: 400, statusMessage: 'Only http and https links can be copied' })
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(entry => entry.address)
  if (addresses.length === 0) throw createError({ statusCode: 400, statusMessage: 'The address of the link cannot be found' })
  if (addresses.some(isPrivateAddress)) throw createError({ statusCode: 400, statusMessage: 'Links to private networks cannot be copied' })
  return url
}

// Follows redirects by hand so every hop is checked
const download = async (raw: string): Promise<Response> => {
  let url = await checkUrl(raw)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'RootsAndRoutes/1.0 (+https://nase-koreny.mikulik.com)' } })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      url = await checkUrl(new URL(location, url).toString())
      continue
    }
    if (!response.ok) throw createError({ statusCode: 502, statusMessage: `The link answered ${response.status}` })
    return response
  }
  throw createError({ statusCode: 502, statusMessage: 'Too many redirects' })
}

const readLimited = async (response: Response): Promise<Buffer> => {
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'The file is larger than 20 MB' })
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = response.body!.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_BYTES) { await reader.cancel(); throw createError({ statusCode: 413, statusMessage: 'The file is larger than 20 MB' }) }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

// The allowed type from a Content-Type header; a generic binary stream (common for downloads and pasted files)
// is decided by the file extension
const mediaType = (rawContentType: string, filename: string) => {
  let contentType = rawContentType.split(';')[0]!.trim().toLowerCase()
  const extension = filename.split('.').pop()?.toLowerCase() || ''
  if (!TYPES[contentType] && ['application/octet-stream', 'binary/octet-stream', ''].includes(contentType)) contentType = BY_EXTENSION[extension] || contentType
  const type = TYPES[contentType]
  return type ? { ...type, contentType } : { contentType }
}

// `prefix`: the Blob folder of the database (databasePaths() in server/utils/access.ts); the tree stores media/<name>
const storeMedia = async (body: Buffer, type: { ext: string; kind: MediaKind; contentType: string }, prefix: string, token: string): Promise<CopiedMedia> => {
  const file = `media/${randomUUID()}.${type.ext}`
  await put(`${prefix}/${file}`, body, { access: 'private', token, contentType: type.contentType, addRandomSuffix: false })
  return { file, format: type.ext, kind: type.kind, contentType: type.contentType, size: body.length }
}

export async function copyRemoteMedia(rawUrl: string, prefix: string, token: string): Promise<CopiedMedia> {
  const response = await download(rawUrl)
  const type = mediaType(response.headers.get('content-type') || '', new URL(response.url || rawUrl).pathname)
  if (!('ext' in type)) throw createError({ statusCode: 415, statusMessage: `The link does not lead to an image or a document (${type.contentType || 'unknown type'})` })
  return storeMedia(await readLimited(response), type, prefix, token)
}

// A file pasted from the clipboard. Vercel functions accept at most 4.5 MB per request; the client keeps under it
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export async function storeUploadedMedia(body: Buffer, rawContentType: string, filename: string, prefix: string, token: string): Promise<CopiedMedia> {
  if (!body.length) throw createError({ statusCode: 400, statusMessage: 'The file is empty' })
  if (body.length > MAX_UPLOAD_BYTES) throw createError({ statusCode: 413, statusMessage: 'The file is larger than 4 MB' })
  const type = mediaType(rawContentType, filename)
  if (!('ext' in type)) throw createError({ statusCode: 415, statusMessage: `The file is not an image or a document (${type.contentType || 'unknown type'})` })
  return storeMedia(body, type, prefix, token)
}

// Only names made by storeMedia, so the request cannot read other blobs
export const isMediaName = (name: string): boolean => /^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(name)

// `dir`: the media folder of a database, or the shared one of the map layer sheets (uploads/gedcom/media)
export async function readMedia(dir: string, name: string, token: string) {
  const blob = await get(`${dir}/${name}`, { access: 'private', token })
  if (!blob?.stream) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const contentType = BY_EXTENSION[name.split('.').pop()!] || 'application/octet-stream'
  // Images, PDF and text open in the browser; office documents are downloaded
  const inline = TYPES[contentType]?.kind === 'image' || contentType === 'application/pdf' || contentType === 'text/plain'
  return { stream: blob.stream, contentType, inline }
}
