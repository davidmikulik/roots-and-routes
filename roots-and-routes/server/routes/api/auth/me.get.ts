// The logged-in user, the databases they can open (with their level) and the default one
import { loadAccounts } from '~~/server/utils/accounts'
import { requireActor, sessionInfo } from '~~/server/utils/access'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store', vary: 'Authorization' })
  const actor = await requireActor(event)
  return sessionInfo(await loadAccounts(), actor)
})
