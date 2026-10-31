// Who is asking (the Bearer token) and which database the request works on (header X-Database), with the level
// of permission that applies there. Every endpoint that reads or changes a tree goes through requireDatabase().
import type { H3Event } from 'h3'
import type { AccessLevel, DatabaseInfo, SessionInfo } from '~~/types/accounts'
import { levelAtLeast, lowerLevel } from '~~/utils/accessLevels'
import { findApiToken, isApiToken, loadAccounts, readSessionToken, saveAccounts, type Accounts, type ApiTokenKind, type DatabaseRecord } from '~~/server/utils/accounts'
import { tokenMatchesAdmin } from '~~/server/utils/adminAuth'

export interface Actor {
  id: string
  username: string
  role: AccessLevel
  // Logged in with ADMIN_API_TOKEN instead of a user account
  system?: boolean
  // Logged in with a personal access key (rr_…): only its database, at most "edit" (editor) or "read" (proposer)
  apiToken?: { id: string; name: string; kind: ApiTokenKind; databaseId: string }
}

// The highest level an access key gives
const TOKEN_LEVEL: Record<ApiTokenKind, AccessLevel> = { proposer: 'read', editor: 'edit' }
// The last use of a key is saved at most this often (not on every request)
const LAST_USED_INTERVAL_MS = 10 * 60_000

export const SYSTEM_ACTOR: Actor = { id: 'system', username: 'ADMIN_API_TOKEN', role: 'admin', system: true }

const bearerOf = (event: H3Event): string => (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '').trim()

// The user behind a token, or null (no token, an invalid or expired one, a deleted user, a changed password)
export async function actorFromToken(token: string, accounts?: Accounts): Promise<Actor | null> {
  if (!token) return null
  if (tokenMatchesAdmin(token)) return SYSTEM_ACTOR
  if (isApiToken(token)) {
    const all = accounts || await loadAccounts()
    const found = findApiToken(all, token)
    if (!found) return null
    const { user, record } = found
    if (!record.lastUsedAt || Date.now() - Date.parse(record.lastUsedAt) > LAST_USED_INTERVAL_MS) {
      record.lastUsedAt = new Date().toISOString()
      void saveAccounts(all).catch(error => console.error('[AUTH] Last use of a key could not be saved:', error))
    }
    return {
      id: user.id,
      username: user.username,
      role: lowerLevel(user.role, TOKEN_LEVEL[record.kind]),
      apiToken: { id: record.id, name: record.name, kind: record.kind, databaseId: record.databaseId },
    }
  }
  const session = readSessionToken(token)
  if (!session) return null
  const user = (accounts || await loadAccounts()).users.find(candidate => candidate.id === session.userId)
  if (!user || user.sessionVersion !== session.version) return null
  return { id: user.id, username: user.username, role: user.role }
}

export async function getActor(event: H3Event): Promise<Actor | null> {
  if (event.context.actor === undefined) event.context.actor = await actorFromToken(bearerOf(event))
  return event.context.actor as Actor | null
}

// A logged-in user whose role is at least `minRole`
export async function requireActor(event: H3Event, minRole: AccessLevel = 'demo'): Promise<Actor> {
  const actor = await getActor(event)
  if (!actor) throw createError({ statusCode: 401, statusMessage: 'Login required' })
  if (!levelAtLeast(actor.role, minRole)) throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
  return actor
}

// The level of a user on a database: administrators have "admin" everywhere; the owner has their role (an editor
// manages their own database); a shared database the lower of the role and the shared level. The public database
// is "demo" for visitors and the role "demo", and "read" (full data, no changes) for logged-in users with a higher
// role; editing it needs a grant.
export function levelOn(accounts: Accounts, actor: Actor | null, db: DatabaseRecord): AccessLevel | null {
  // An access key works for its own database only and never above its kind
  if (actor?.apiToken) {
    if (db.id !== actor.apiToken.databaseId) return null
    const level = levelOn(accounts, { ...actor, apiToken: undefined }, db)
    return level ? lowerLevel(level, TOKEN_LEVEL[actor.apiToken.kind]) : null
  }
  const isPublic = accounts.publicDatabaseId === db.id
  if (!actor) return isPublic ? 'demo' : null
  if (actor.role === 'admin') return 'admin'
  if (db.ownerId === actor.id) return actor.role === 'edit' ? 'admin' : actor.role
  const grant = db.grants.find(candidate => candidate.userId === actor.id)
  const shared = grant ? lowerLevel(grant.level, actor.role) : null
  const publicLevel: AccessLevel | null = isPublic ? lowerLevel('read', actor.role) : null
  if (!shared) return publicLevel
  return publicLevel && levelAtLeast(publicLevel, shared) ? publicLevel : shared
}

const usernameOf = (accounts: Accounts, id: string | null): string => accounts.users.find(user => user.id === id)?.username || ''

export function databaseInfo(accounts: Accounts, actor: Actor | null, db: DatabaseRecord, level: AccessLevel): DatabaseInfo {
  return {
    id: db.id,
    name: db.name,
    ownerId: db.ownerId,
    ownerName: usernameOf(accounts, db.ownerId),
    level,
    owned: !!actor && db.ownerId === actor.id,
    isPublic: accounts.publicDatabaseId === db.id,
    ...(level === 'admin' ? { grants: db.grants.map(grant => ({ ...grant, username: usernameOf(accounts, grant.userId) })) } : {}),
  }
}

// Databases the user can open: their own first, then shared ones, then the rest (administrators), by name
export function accessibleDatabases(accounts: Accounts, actor: Actor | null): { db: DatabaseRecord; level: AccessLevel }[] {
  const rank = (db: DatabaseRecord) => (actor && db.ownerId === actor.id ? 0 : db.grants.some(grant => grant.userId === actor?.id) ? 1 : 2)
  return accounts.databases
    .map(db => ({ db, level: levelOn(accounts, actor, db) }))
    .filter((entry): entry is { db: DatabaseRecord; level: AccessLevel } => !!entry.level)
    .sort((first, second) => rank(first.db) - rank(second.db) || first.db.name.localeCompare(second.db.name, 'cs'))
}

// Without a choice: the user's own database, a shared one, the public one
export function defaultDatabase(accounts: Accounts, actor: Actor | null): DatabaseRecord | null {
  const list = accessibleDatabases(accounts, actor)
  if (!actor) return list[0]?.db || null
  if (actor.role === 'admin') {
    return list.find(entry => entry.db.ownerId === actor.id)?.db
      || accounts.databases.find(db => db.id === accounts.publicDatabaseId) || list[0]?.db || null
  }
  return list.find(entry => entry.db.id !== accounts.publicDatabaseId || entry.level !== 'demo')?.db || list[0]?.db || null
}

export interface DatabaseAccess {
  actor: Actor | null
  accounts: Accounts
  db: DatabaseRecord
  level: AccessLevel
}

// The database of the request (header X-Database, otherwise the default one) and the level on it.
// `fallback`: a database the user cannot open (no longer shared, deleted) silently gives the default one; only for
// reading, a change must never land in another tree than the one the user sees.
export async function resolveDatabase(event: H3Event, options: { fallback?: boolean } = {}): Promise<DatabaseAccess | null> {
  const accounts = await loadAccounts()
  const actor = await getActor(event)
  const requested = String(getHeader(event, 'x-database') || '').trim()
  if (requested) {
    const db = accounts.databases.find(candidate => candidate.id === requested)
    const level = db ? levelOn(accounts, actor, db) : null
    if (db && level) return { actor, accounts, db, level }
    if (!options.fallback) throw createError({ statusCode: actor ? 403 : 401, statusMessage: 'No access to this database' })
  }
  const db = defaultDatabase(accounts, actor)
  if (!db) return null
  return { actor, accounts, db, level: levelOn(accounts, actor, db)! }
}

// The database of the request, with at least the level `min`
export async function requireDatabase(event: H3Event, min: AccessLevel): Promise<DatabaseAccess> {
  const access = await resolveDatabase(event)
  if (!access) throw createError({ statusCode: (await getActor(event)) ? 404 : 401, statusMessage: 'No database is available' })
  if (!levelAtLeast(access.level, min)) {
    throw createError({ statusCode: access.actor ? 403 : 401, statusMessage: 'Permission denied' })
  }
  return access
}

// Files of a database in the Blob store
export const databasePaths = (db: DatabaseRecord) => ({
  prefix: db.prefix,
  original: `${db.prefix}/current.ged`,
  parsed: `${db.prefix}/parsed/current.json`,
  backups: `${db.prefix}/backups`,
  media: `${db.prefix}/media`,
  history: `${db.prefix}/history`,
  pending: `${db.prefix}/pending`,
})

// GET /api/auth/me and the answer to a login
export function sessionInfo(accounts: Accounts, actor: Actor): SessionInfo {
  return {
    user: { id: actor.id, username: actor.username, role: actor.role },
    databases: accessibleDatabases(accounts, actor).map(({ db, level }) => databaseInfo(accounts, actor, db, level)),
    defaultDatabaseId: defaultDatabase(accounts, actor)?.id || null,
  }
}

// Changes that wait for approval: the level "edit", or a proposer's access key ("read" on its database)
export async function requireEditOrProposer(event: H3Event): Promise<DatabaseAccess & { proposer: boolean }> {
  const access = await requireDatabase(event, 'read')
  const proposer = access.actor?.apiToken?.kind === 'proposer'
  if (!proposer && !levelAtLeast(access.level, 'edit')) throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
  return { ...access, proposer }
}
