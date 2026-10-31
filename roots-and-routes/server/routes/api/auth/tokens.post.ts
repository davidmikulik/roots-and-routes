// A new access key { name, kind: 'proposer' | 'editor', databaseId, expiresInDays? }. The answer contains the key
// itself once; only its hash is stored. A proposer needs the level "read" on the database, an editor "edit".
import { createApiToken, loadAccounts, saveAccounts, type ApiTokenRecord } from '~~/server/utils/accounts'
import { levelOn } from '~~/server/utils/access'
import { levelAtLeast } from '~~/utils/accessLevels'
import { requireTokenOwner, tokenInfo } from '~~/server/utils/apiTokens'

const MAX_TOKENS = 20

export default defineEventHandler(async (event) => {
  const actor = await requireTokenOwner(event)
  const body = await readBody<{ name?: unknown; kind?: unknown; databaseId?: unknown; expiresInDays?: unknown }>(event)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const kind = body?.kind === 'editor' ? 'editor' : body?.kind === 'proposer' ? 'proposer' : null
  if (!name) throw createError({ statusCode: 400, statusMessage: 'The key needs a name' })
  if (!kind) throw createError({ statusCode: 400, statusMessage: 'kind must be proposer or editor' })
  const accounts = await loadAccounts()
  const user = accounts.users.find(candidate => candidate.id === actor.id)
  const db = accounts.databases.find(candidate => candidate.id === body?.databaseId)
  if (!user || !db) throw createError({ statusCode: 400, statusMessage: 'Unknown database' })
  const level = levelOn(accounts, actor, db)
  if (!levelAtLeast(level, kind === 'editor' ? 'edit' : 'read')) throw createError({ statusCode: 403, statusMessage: 'You cannot give a key more than your own permission on the database' })
  if ((user.apiTokens || []).length >= MAX_TOKENS) throw createError({ statusCode: 400, statusMessage: `At most ${MAX_TOKENS} keys` })
  const days = Number(body?.expiresInDays)
  const { id, token, hash } = createApiToken()
  const record: ApiTokenRecord = {
    id, name, hash, kind, databaseId: db.id, createdAt: new Date().toISOString(),
    ...(Number.isFinite(days) && days > 0 ? { expiresAt: new Date(Date.now() + Math.min(days, 3650) * 86_400_000).toISOString() } : {}),
  }
  user.apiTokens = [...(user.apiTokens || []), record]
  await saveAccounts(accounts)
  console.log(`[AUTH] ${user.username} created the ${kind} key "${name}" for ${db.id}`)
  return { token, info: tokenInfo(accounts, record) }
})
