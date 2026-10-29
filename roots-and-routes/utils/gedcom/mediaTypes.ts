// The images and documents the tree can store as attachments (media/<uuid>.<ext>), shared by the server
// (server/utils/media.ts) and the browser (uploading a backup with its attachments)
export type MediaKind = 'image' | 'document'

export const MEDIA_TYPES: Record<string, { ext: string; kind: MediaKind }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'document' },
  'text/plain': { ext: 'txt', kind: 'document' },
  'application/rtf': { ext: 'rtf', kind: 'document' },
  'application/msword': { ext: 'doc', kind: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'document' },
  'application/vnd.oasis.opendocument.text': { ext: 'odt', kind: 'document' },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'document' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'document' },
  'application/vnd.oasis.opendocument.spreadsheet': { ext: 'ods', kind: 'document' },
}

export const MEDIA_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MEDIA_TYPES).map(([contentType, info]) => [info.ext, contentType])),
  jpeg: 'image/jpeg',
}

// The path of an attachment stored in the tree (FILE media/<uuid>.<ext>)
export const STORED_MEDIA_PATH = /^media\/[0-9a-f-]{36}\.[a-z]{3,4}$/

// Content type of a stored attachment by its extension
export const mediaContentType = (path: string): string => MEDIA_BY_EXTENSION[path.split('.').pop()?.toLowerCase() || ''] || 'application/octet-stream'
