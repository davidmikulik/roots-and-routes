// Names of the users, for sharing a database (needs a role that can own a database)
import { loadAccounts } from '~~/server/utils/accounts'
import { requireActor } from '~~/server/utils/access'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'edit')
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const accounts = await loadAccounts()
  return {
    users: accounts.users
      .map(user => ({ id: user.id, username: user.username, role: user.role }))
      .sort((first, second) => first.username.localeCompare(second.username, 'cs')),
  }
})
