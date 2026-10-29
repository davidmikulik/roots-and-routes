// Server-side backups of the whole tree of one database, kept in the private Blob store next to its data
// (<prefix>/backups, see databasePaths() in server/utils/access.ts).
// A backup is <id>.ged plus copies of the attachments the tree links to (<id>/media/<name>, copied inside the Blob
// store, nothing is downloaded); restoring puts back attachments that are missing.
import { put, del, copy } from '@vercel/blob'
import { requireBlobToken, loadParsedGedcom, getFileText, fileExists, listAllBlobs } from '~~/server/utils/storage'
import { databasePaths } from '~~/server/utils/access'
import type { DatabaseRecord } from '~~/server/utils/accounts'
import { writeGedcom } from '~~/utils/gedcom/parser'
import type { GedcomFile } from '~~/types/gedcom'

export interface BackupInfo { id: string; createdAt: string; size: number; attachments: number }

const BACKUP_ID = /^\d{8}-\d{6}-\d{3}$/
const backupDir = (db: DatabaseRecord): string => databasePaths(db).backups
const backupPath = (db: DatabaseRecord, id: string): string => `${backupDir(db)}/${id}.ged`
const backupMediaPath = (db: DatabaseRecord, id: string, media: string): string => `${backupDir(db)}/${id}/${media}`
// media/<name> in the tree is <prefix>/media/<name> in the Blob store
const mediaPath = (db: DatabaseRecord, path: string): string => `${databasePaths(db).prefix}/${path}`

export const clampBackupCount = (value: unknown, fallback = 5): number => {
  const count = Number(value)
  return Number.isFinite(count) ? Math.min(20, Math.max(1, Math.round(count))) : fallback
}

// Attachments stored in the tree (FILE media/<name>), see server/utils/media.ts
export const storedMediaOf = (file: GedcomFile): string[] =>
  [...new Set([...file.multimedia.values()].map(media => media.file || '').filter(path => /^media\/[0-9a-f-]{36}\.[a-z]{3,4}$/.test(path)))]

// A few Blob operations at a time
const eachLimited = async <T>(items: T[], run: (item: T) => Promise<unknown>, limit = 5): Promise<void> => {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await run(items[next++]!)
  }))
}

export async function listBackups(db: DatabaseRecord): Promise<BackupInfo[]> {
  const blobs = await listAllBlobs(`${backupDir(db)}/`)
  const media = new Map<string, { count: number; size: number }>()
  for (const blob of blobs) {
    const id = blob.pathname.slice(backupDir(db).length + 1).split('/')[0]!
    if (!blob.pathname.endsWith('.ged') && BACKUP_ID.test(id)) {
      const entry = media.get(id) || { count: 0, size: 0 }
      media.set(id, { count: entry.count + 1, size: entry.size + blob.size })
    }
  }
  return blobs
    .filter(blob => blob.pathname.endsWith('.ged'))
    .map(blob => ({ id: blob.pathname.split('/').pop()!.replace(/\.ged$/, ''), createdAt: new Date(blob.uploadedAt).toISOString(), size: blob.size }))
    .filter(backup => BACKUP_ID.test(backup.id))
    .map(backup => ({ ...backup, size: backup.size + (media.get(backup.id)?.size || 0), attachments: media.get(backup.id)?.count || 0 }))
    .sort((first, second) => second.id.localeCompare(first.id))
}

async function pruneBackups(db: DatabaseRecord, keep: number): Promise<void> {
  const surplus = new Set((await listBackups(db)).slice(keep).map(backup => backup.id))
  if (!surplus.size) return
  const paths = (await listAllBlobs(`${backupDir(db)}/`))
    .map(blob => blob.pathname)
    .filter(path => surplus.has(path.slice(backupDir(db).length + 1).split('/')[0]!.replace(/\.ged$/, '')))
  for (let start = 0; start < paths.length; start += 500) await del(paths.slice(start, start + 500), { token: requireBlobToken() })
}

// Backs up the current tree (as GEDCOM text) with its attachments and keeps only the newest `keep` backups.
// Returns null when there is nothing to back up.
export async function createBackup(db: DatabaseRecord, keep: number): Promise<string | null> {
  const current = await loadParsedGedcom(databasePaths(db).parsed)
  if (!current || current.individuals.size === 0) return null
  // 20261012-154903-123
  const id = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '')
  const token = requireBlobToken()
  await put(backupPath(db, id), writeGedcom(current, { version: '5.5', encoding: 'UTF-8' }), {
    access: 'private',
    token,
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
  })
  const media = storedMediaOf(current)
  let missing = 0
  await eachLimited(media, path => copy(mediaPath(db, path), backupMediaPath(db, id, path), { access: 'private', token, addRandomSuffix: false })
    .catch((error) => { missing++; console.error(`[BACKUP] Attachment ${path} could not be copied:`, error?.message) }))
  console.log(`[BACKUP] ${id}: ${media.length - missing} of ${media.length} attachments`)
  await pruneBackups(db, keep)
  return id
}

// The folder of a backup's attachments (for downloading the backup with them, GET /api/admin/backups/<id>/media/<name>)
export function backupMediaDir(db: DatabaseRecord, id: string): string {
  if (!BACKUP_ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid backup id' })
  return `${backupDir(db)}/${id}/media`
}

export async function readBackup(db: DatabaseRecord, id: string): Promise<string> {
  if (!BACKUP_ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid backup id' })
  return await getFileText(backupPath(db, id))
}

// After a restore: attachments of the restored tree that are no longer in media/ come back from the backup
export async function restoreBackupMedia(db: DatabaseRecord, id: string, file: GedcomFile): Promise<number> {
  if (!BACKUP_ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid backup id' })
  const token = requireBlobToken()
  let restored = 0
  await eachLimited(storedMediaOf(file), async (path) => {
    if (await fileExists(mediaPath(db, path))) return
    try {
      await copy(backupMediaPath(db, id, path), mediaPath(db, path), { access: 'private', token, addRandomSuffix: false })
      restored++
    } catch (error: any) {
      console.error(`[BACKUP] Attachment ${path} is not in backup ${id}:`, error?.message)
    }
  })
  return restored
}
