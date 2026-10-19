// Changes a database: name and sharing (whoever manages it: the owner or an administrator); owner and whether
// visitors see it anonymized (administrators only)
import type { AccessLevel } from '~~/types/accounts'
import { loadAccounts, saveAccounts } from '~~/server/utils/accounts'
import { databaseInfo, getActor, levelOn } from '~~/server/utils/access'
import { checkDatabaseName, checkLevel } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  const actor = await getActor(event)
  const accounts = await loadAccounts()
  const db = accounts.databases.find(candidate => candidate.id === getRouterParam(event, 'id'))
  if (!db) throw createError({ statusCode: 404, statusMessage: 'Database not found' })
  if (levelOn(accounts, actor, db) !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
  const isAdmin = actor?.role === 'admin'
  const body = await readBody<{ name?: unknown; grants?: unknown; isPublic?: unknown; ownerId?: unknown }>(event)

  if (body?.name !== undefined) db.name = checkDatabaseName(body.name)
  if (body?.ownerId !== undefined) {
    if (!isAdmin) throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
    if (typeof body.ownerId !== 'string' || !accounts.users.some(user => user.id === body.ownerId)) throw createError({ statusCode: 404, statusMessage: 'User not found' })
    db.ownerId = body.ownerId
  }
  if (body?.grants !== undefined) {
    if (!Array.isArray(body.grants) || body.grants.length > 500) throw createError({ statusCode: 400, statusMessage: 'Invalid sharing' })
    const grants = new Map<string, AccessLevel>()
    for (const raw of body.grants as { userId?: unknown; level?: unknown }[]) {
      if (typeof raw?.userId !== 'string' || !accounts.users.some(user => user.id === raw.userId)) throw createError({ statusCode: 404, statusMessage: 'User not found' })
      grants.set(raw.userId, checkLevel(raw.level))
    }
    db.grants = [...grants].map(([userId, level]) => ({ userId, level }))
  }
  // The owner needs no grant
  db.grants = db.grants.filter(grant => grant.userId !== db.ownerId)
  if (body?.isPublic !== undefined) {
    if (!isAdmin) throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
    if (body.isPublic === true) accounts.publicDatabaseId = db.id
    else if (accounts.publicDatabaseId === db.id) accounts.publicDatabaseId = null
  }
  await saveAccounts(accounts)
  return { success: true, database: databaseInfo(accounts, actor, db, levelOn(accounts, actor, db)!) }
})
