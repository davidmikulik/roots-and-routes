// Revokes an access key of the logged-in user; it stops working right away
import { loadAccounts, saveAccounts } from '~~/server/utils/accounts'
import { requireTokenOwner } from '~~/server/utils/apiTokens'

export default defineEventHandler(async (event) => {
  const actor = await requireTokenOwner(event)
  const id = getRouterParam(event, 'id') || ''
  const accounts = await loadAccounts()
  const user = accounts.users.find(candidate => candidate.id === actor.id)
  if (!user?.apiTokens?.some(record => record.id === id)) throw createError({ statusCode: 404, statusMessage: 'No such key' })
  user.apiTokens = user.apiTokens.filter(record => record.id !== id)
  await saveAccounts(accounts)
  return { success: true }
})
