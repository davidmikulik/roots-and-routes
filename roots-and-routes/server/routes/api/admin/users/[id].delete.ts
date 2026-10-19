// Deletes a user (administrators only). Their databases are not deleted: they pass to the administrator who deletes
// the user (with ADMIN_API_TOKEN they stay without an owner, reachable by administrators).
import { loadAccounts, saveAccounts } from '~~/server/utils/accounts'
import { requireActor } from '~~/server/utils/access'
import { isLastAdmin } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'admin')
  const accounts = await loadAccounts()
  const user = accounts.users.find(candidate => candidate.id === getRouterParam(event, 'id'))
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (user.id === actor.id) throw createError({ statusCode: 409, statusMessage: 'You cannot delete yourself' })
  if (user.role === 'admin' && isLastAdmin(accounts, user.id)) throw createError({ statusCode: 409, statusMessage: 'The last administrator cannot be deleted' })
  accounts.users = accounts.users.filter(candidate => candidate.id !== user.id)
  let transferred = 0
  for (const db of accounts.databases) {
    db.grants = db.grants.filter(grant => grant.userId !== user.id)
    if (db.ownerId === user.id) {
      db.ownerId = actor.system ? null : actor.id
      transferred++
    }
  }
  await saveAccounts(accounts)
  console.log(`[AUTH] User ${user.username} deleted, ${transferred} databases passed on`)
  return { success: true, transferred }
})
