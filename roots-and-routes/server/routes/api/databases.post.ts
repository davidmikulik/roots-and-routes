// A new, empty database. Users who can edit create their own; an administrator can create one for another user.
import { loadAccounts, saveAccounts } from '~~/server/utils/accounts'
import { databaseInfo, levelOn, requireActor } from '~~/server/utils/access'
import { checkDatabaseName, createDatabaseRecord } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'edit')
  const body = await readBody<{ name?: unknown; ownerId?: unknown }>(event)
  const accounts = await loadAccounts()
  const name = checkDatabaseName(body?.name)
  let ownerId: string | null = actor.system ? null : actor.id
  if (typeof body?.ownerId === 'string' && body.ownerId && body.ownerId !== ownerId) {
    if (actor.role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
    if (!accounts.users.some(user => user.id === body.ownerId)) throw createError({ statusCode: 404, statusMessage: 'User not found' })
    ownerId = body.ownerId
  }
  const db = createDatabaseRecord(name, ownerId)
  accounts.databases.push(db)
  await saveAccounts(accounts)
  return { success: true, database: databaseInfo(accounts, actor, db, levelOn(accounts, actor, db)!) }
})
