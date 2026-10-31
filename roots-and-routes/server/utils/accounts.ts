// Users, their sessions and the databases (separate family trees) in the private Blob store
// (uploads/gedcom/accounts.json). Passwords are stored as scrypt hashes; a session is a signed token (HMAC) with the
// user id and the user's session version, so changing the password or deleting the user ends every session.
//
// Each database keeps its files under its own prefix: current.ged, parsed/current.json, backups/ and media/. The tree
// from before the accounts existed is the database "main" with the old prefix uploads/gedcom, so nothing is moved.
// Until the first user exists, the first login with the password ADMIN_API_TOKEN creates the administrator (and makes
// them the owner of "main"). ADMIN_API_TOKEN itself keeps working as a Bearer token with the rights of an
// administrator (scripts, recovery), see server/utils/access.ts.
import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { get, put } from '@vercel/blob'
import type { AccessLevel } from '~~/types/accounts'
import { isAccessLevel, normalizeUsername } from '~~/utils/accessLevels'
import { getBlobToken, getUploadDir, requireBlobToken } from '~~/server/utils/storage'

export interface UserRecord {
  id: string
  username: string
  role: AccessLevel
  passwordHash: string
  passwordSalt: string
  // Raised by a password change; sessions signed with an older version are no longer valid
  sessionVersion: number
  createdAt: string
  // Personal access keys for automated work (scripts), see apiTokens below
  apiTokens?: ApiTokenRecord[]
}

// A personal access key: "rr_<id>_<secret>", sent as "Authorization: Bearer rr_…". Only the SHA-256 hash of the secret
// is stored (the secret is 32 random bytes, so a fast hash is enough; the key itself is shown once). A key works for
// one database only: "proposer" reads and sends batches of changes that wait for approval in the app, "editor" also
// saves them right away. It never manages users, databases, backups or other keys (server/middleware/apiTokenScope.ts).
export type ApiTokenKind = 'proposer' | 'editor'

export interface ApiTokenRecord {
  id: string
  name: string
  hash: string
  kind: ApiTokenKind
  databaseId: string
  createdAt: string
  expiresAt?: string
  lastUsedAt?: string
}

export interface DatabaseRecord {
  id: string
  name: string
  // null: nobody owns it (its owner was deleted by the ADMIN_API_TOKEN), only administrators reach it
  ownerId: string | null
  // Blob folder of the database's files; never sent to the client
  prefix: string
  createdAt: string
  grants: { userId: string; level: AccessLevel }[]
}

export interface Accounts {
  users: UserRecord[]
  databases: DatabaseRecord[]
  // The database visitors who are not logged in see (anonymized); null = none
  publicDatabaseId: string | null
}

export const LEGACY_DATABASE_ID = 'main'
const accountsPath = (): string => `${getUploadDir()}/accounts.json`
export const newDatabasePrefix = (id: string): string => `${getUploadDir()}/databases/${id}`

const initialAccounts = (): Accounts => ({
  users: [],
  databases: [{ id: LEGACY_DATABASE_ID, name: 'Rodokmen', ownerId: null, prefix: getUploadDir(), createdAt: new Date(0).toISOString(), grants: [] }],
  publicDatabaseId: LEGACY_DATABASE_ID,
})

const sanitizeAccounts = (raw: unknown): Accounts => {
  const value = (raw || {}) as Partial<Accounts>
  const users = (Array.isArray(value.users) ? value.users : [])
    .filter(user => user && typeof user.id === 'string' && typeof user.username === 'string' && isAccessLevel(user.role)
      && typeof user.passwordHash === 'string' && typeof user.passwordSalt === 'string')
    .map(user => ({
      ...user,
      sessionVersion: Number(user.sessionVersion) || 0,
      apiTokens: (Array.isArray(user.apiTokens) ? user.apiTokens : []).filter(token =>
        token && typeof token.id === 'string' && typeof token.hash === 'string' && (token.kind === 'proposer' || token.kind === 'editor') && typeof token.databaseId === 'string'),
    }))
  const userIds = new Set(users.map(user => user.id))
  const databases = (Array.isArray(value.databases) ? value.databases : [])
    .filter(db => db && typeof db.id === 'string' && typeof db.name === 'string' && typeof db.prefix === 'string')
    .map(db => ({
      ...db,
      ownerId: typeof db.ownerId === 'string' && userIds.has(db.ownerId) ? db.ownerId : null,
      grants: (Array.isArray(db.grants) ? db.grants : []).filter(grant => userIds.has(grant?.userId) && isAccessLevel(grant.level)),
    }))
  const publicDatabaseId = databases.some(db => db.id === value.publicDatabaseId) ? value.publicDatabaseId! : null
  return { users, databases, publicDatabaseId }
}

// A warm serverless instance reads the accounts on (almost) every request; a few seconds of cache saves the Blob
// round trip. Changes made by this instance replace the cache right away.
const CACHE_MS = 3000
let cache: { at: number; accounts: Accounts } | null = null

export async function loadAccounts(): Promise<Accounts> {
  if (cache && Date.now() - cache.at < CACHE_MS) return structuredClone(cache.accounts)
  // get() returns null only when the blob does not exist; any other failure throws, so nothing is overwritten
  const blob = await get(accountsPath(), { access: 'private', token: requireBlobToken(), useCache: false })
  const accounts = blob?.stream ? sanitizeAccounts(JSON.parse(await new Response(blob.stream).text())) : initialAccounts()
  cache = { at: Date.now(), accounts }
  return structuredClone(accounts)
}

export async function saveAccounts(accounts: Accounts): Promise<void> {
  await put(accountsPath(), JSON.stringify(accounts, null, 2), {
    access: 'private',
    token: requireBlobToken(),
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  cache = { at: Date.now(), accounts: structuredClone(accounts) }
}

export const findUserByName = (accounts: Accounts, username: string): UserRecord | undefined =>
  accounts.users.find(user => normalizeUsername(user.username) === normalizeUsername(username))

// Passwords
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>

export async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return { passwordHash: hash.toString('base64'), passwordSalt: salt.toString('base64') }
}

export async function passwordMatches(user: UserRecord, password: string): Promise<boolean> {
  const expected = Buffer.from(user.passwordHash, 'base64')
  const actual = await scryptAsync(password, Buffer.from(user.passwordSalt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

// Sessions: <payload>.<signature>, payload = base64url JSON { u: user id, v: session version, e: expiry (ms) }
const SESSION_DAYS = 30
const sessionSecret = (): string => {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_API_TOKEN || getBlobToken()
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'Set SESSION_SECRET to enable logging in' })
  return secret
}
const sign = (payload: string): string => createHmac('sha256', sessionSecret()).update(`session:${payload}`).digest('base64url')

export function createSessionToken(user: UserRecord): string {
  const payload = Buffer.from(JSON.stringify({ u: user.id, v: user.sessionVersion, e: Date.now() + SESSION_DAYS * 86_400_000 })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readSessionToken(token: string): { userId: string; version: number } | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; v?: unknown; e?: unknown }
    if (typeof data.u !== 'string' || typeof data.v !== 'number' || typeof data.e !== 'number' || data.e < Date.now()) return null
    return { userId: data.u, version: data.v }
  } catch {
    return null
  }
}

export const newId = (): string => randomUUID()

// Access keys: rr_<12 hex id>_<43 characters of base64url>
const API_TOKEN_PATTERN = /^rr_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/
export const isApiToken = (token: string): boolean => token.startsWith('rr_')
const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex')

export function createApiToken(): { id: string; token: string; hash: string } {
  const id = randomBytes(6).toString('hex')
  const secret = randomBytes(32).toString('base64url')
  return { id, token: `rr_${id}_${secret}`, hash: hashSecret(secret) }
}

// The user and the key behind an access key; null for a wrong, revoked or expired key
export function findApiToken(accounts: Accounts, token: string): { user: UserRecord; record: ApiTokenRecord } | null {
  const match = API_TOKEN_PATTERN.exec(token)
  if (!match) return null
  const [, id, secret] = match as unknown as [string, string, string]
  for (const user of accounts.users) {
    const record = user.apiTokens?.find(candidate => candidate.id === id)
    if (!record) continue
    const expected = Buffer.from(record.hash, 'hex')
    const actual = Buffer.from(hashSecret(secret), 'hex')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) return null
    return { user, record }
  }
  return null
}
