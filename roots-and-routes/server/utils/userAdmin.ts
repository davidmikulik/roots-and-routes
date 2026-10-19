// Shared checks of the user and database administration endpoints
import { del } from '@vercel/blob'
import type { AccessLevel, UserInfo } from '~~/types/accounts'
import { isAccessLevel, isValidUsername, MIN_PASSWORD_LENGTH } from '~~/utils/accessLevels'
import { findUserByName, newDatabasePrefix, newId, type Accounts, type DatabaseRecord, type UserRecord } from '~~/server/utils/accounts'
import { getUploadDir, listAllBlobs, requireBlobToken } from '~~/server/utils/storage'

export const userInfo = (accounts: Accounts, user: UserRecord): UserInfo => ({
  id: user.id,
  username: user.username,
  role: user.role,
  createdAt: user.createdAt,
  ownedDatabases: accounts.databases.filter(db => db.ownerId === user.id).length,
})

export function checkUsername(accounts: Accounts, value: unknown, exceptId?: string): string {
  const username = typeof value === 'string' ? value.trim() : ''
  if (!isValidUsername(username)) throw createError({ statusCode: 400, statusMessage: 'Invalid user name' })
  const existing = findUserByName(accounts, username)
  if (existing && existing.id !== exceptId) throw createError({ statusCode: 409, statusMessage: 'The user name is taken' })
  return username
}

export function checkPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) throw createError({ statusCode: 400, statusMessage: 'Password is too short' })
  return value
}

export function checkLevel(value: unknown): AccessLevel {
  if (!isAccessLevel(value)) throw createError({ statusCode: 400, statusMessage: 'Invalid permission' })
  return value
}

export function checkDatabaseName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name || name.length > 100) throw createError({ statusCode: 400, statusMessage: 'Invalid database name' })
  return name
}

export const createDatabaseRecord = (name: string, ownerId: string | null): DatabaseRecord => {
  const id = newId()
  return { id, name, ownerId, prefix: newDatabasePrefix(id), createdAt: new Date().toISOString(), grants: [] }
}

// At least one administrator must remain
export const isLastAdmin = (accounts: Accounts, userId: string): boolean =>
  accounts.users.filter(user => user.role === 'admin').every(user => user.id === userId)

// Deletes the files of a database. The tree from before the accounts shares its folder with the other data
// (known places, map layers and their sheets), so only its tree, parsed copy and backups go; its attachments stay.
export async function deleteDatabaseFiles(db: DatabaseRecord): Promise<number> {
  const legacy = db.prefix === getUploadDir()
  const paths = legacy
    ? [
        ...(await listAllBlobs(`${db.prefix}/backups/`)),
        ...(await listAllBlobs(`${db.prefix}/parsed/current.json`)),
        ...(await listAllBlobs(`${db.prefix}/current.ged`)),
      ].map(blob => blob.pathname)
    : (await listAllBlobs(`${db.prefix}/`)).map(blob => blob.pathname)
  for (let start = 0; start < paths.length; start += 500) await del(paths.slice(start, start + 500), { token: requireBlobToken() })
  return paths.length
}
