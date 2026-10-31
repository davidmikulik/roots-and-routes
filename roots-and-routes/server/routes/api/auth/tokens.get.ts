// The access keys of the logged-in user (without the keys themselves, they are shown only once)
import { loadAccounts } from '~~/server/utils/accounts'
import { requireTokenOwner, tokenInfo } from '~~/server/utils/apiTokens'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const actor = await requireTokenOwner(event)
  const accounts = await loadAccounts()
  const user = accounts.users.find(candidate => candidate.id === actor.id)
  return { tokens: (user?.apiTokens || []).map(record => tokenInfo(accounts, record)) }
})
