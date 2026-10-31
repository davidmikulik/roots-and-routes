// Personal access keys of the logged-in user (Můj účet → Přístupové klíče), see server/utils/accounts.ts
import type { H3Event } from 'h3'
import type { AccessLevel } from '~~/types/accounts'
import type { ApiTokenRecord, Accounts } from '~~/server/utils/accounts'
import { requireActor, type Actor } from '~~/server/utils/access'

export interface ApiTokenInfo {
  id: string
  name: string
  kind: ApiTokenRecord['kind']
  databaseId: string
  databaseName: string
  createdAt: string
  expiresAt?: string
  lastUsedAt?: string
}

// Keys are managed by a person who logged in with a password, never by a key or ADMIN_API_TOKEN (no user behind it)
export async function requireTokenOwner(event: H3Event, minRole: AccessLevel = 'read'): Promise<Actor> {
  const actor = await requireActor(event, minRole)
  if (actor.apiToken) throw createError({ statusCode: 403, statusMessage: 'Not available with an access key' })
  if (actor.system) throw createError({ statusCode: 400, statusMessage: 'Log in with a user account to manage access keys' })
  return actor
}

export const tokenInfo = (accounts: Accounts, record: ApiTokenRecord): ApiTokenInfo => ({
  id: record.id,
  name: record.name,
  kind: record.kind,
  databaseId: record.databaseId,
  databaseName: accounts.databases.find(db => db.id === record.databaseId)?.name || record.databaseId,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  lastUsedAt: record.lastUsedAt,
})
