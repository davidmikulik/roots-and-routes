// Server-side backups of the whole tree, kept in the private Blob store next to the data
import { put, list, del } from '@vercel/blob'
import { requireBlobToken, getUploadDir, loadParsedGedcom, getFileText } from '~~/server/utils/storage'
import { writeGedcom } from '~~/utils/gedcom/parser'

export interface BackupInfo { id: string; createdAt: string; size: number }

const BACKUP_ID = /^\d{8}-\d{6}-\d{3}$/
const backupDir = (): string => `${getUploadDir()}/backups`
const backupPath = (id: string): string => `${backupDir()}/${id}.ged`

export const clampBackupCount = (value: unknown, fallback = 5): number => {
  const count = Number(value)
  return Number.isFinite(count) ? Math.min(20, Math.max(1, Math.round(count))) : fallback
}

export async function listBackups(): Promise<BackupInfo[]> {
  const { blobs } = await list({ prefix: `${backupDir()}/`, token: requireBlobToken() })
  return blobs
    .map(blob => ({ id: blob.pathname.split('/').pop()!.replace(/\.ged$/, ''), createdAt: new Date(blob.uploadedAt).toISOString(), size: blob.size }))
    .filter(backup => BACKUP_ID.test(backup.id))
    .sort((first, second) => second.id.localeCompare(first.id))
}

async function pruneBackups(keep: number): Promise<void> {
  const surplus = (await listBackups()).slice(keep)
  if (surplus.length) await del(surplus.map(backup => backupPath(backup.id)), { token: requireBlobToken() })
}

// Backs up the current tree (as GEDCOM text) and keeps only the newest `keep` backups. Returns null when there is nothing to back up.
export async function createBackup(keep: number): Promise<string | null> {
  const current = await loadParsedGedcom('current')
  if (!current || current.individuals.size === 0) return null
  // 20261012-154903-123
  const id = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '-').replace('Z', '')
  await put(backupPath(id), writeGedcom(current, { version: '5.5', encoding: 'UTF-8' }), {
    access: 'private',
    token: requireBlobToken(),
    contentType: 'application/octet-stream',
    addRandomSuffix: false,
  })
  await pruneBackups(keep)
  return id
}

export async function readBackup(id: string): Promise<string> {
  if (!BACKUP_ID.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid backup id' })
  return await getFileText(backupPath(id))
}
