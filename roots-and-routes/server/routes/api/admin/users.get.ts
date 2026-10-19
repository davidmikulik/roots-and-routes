// All users (administrators only)
import { loadAccounts } from '~~/server/utils/accounts'
import { requireActor } from '~~/server/utils/access'
import { userInfo } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'admin')
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const accounts = await loadAccounts()
  return { users: accounts.users.map(user => userInfo(accounts, user)).sort((first, second) => first.username.localeCompare(second.username, 'cs')) }
})
