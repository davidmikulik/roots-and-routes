// Changes the user's own password (the current one is required). Every other session of the user ends; the answer
// carries a new token for this one.
import { createSessionToken, hashPassword, loadAccounts, passwordMatches, saveAccounts } from '~~/server/utils/accounts'
import { requireActor } from '~~/server/utils/access'
import { MIN_PASSWORD_LENGTH } from '~~/utils/accessLevels'

export default defineEventHandler(async (event) => {
  const actor = await requireActor(event)
  if (actor.system) throw createError({ statusCode: 400, statusMessage: 'ADMIN_API_TOKEN has no password to change' })
  const body = await readBody<{ current?: unknown; password?: unknown }>(event)
  const current = typeof body?.current === 'string' ? body.current : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) throw createError({ statusCode: 400, statusMessage: 'Password is too short' })

  const accounts = await loadAccounts()
  const user = accounts.users.find(candidate => candidate.id === actor.id)!
  if (!await passwordMatches(user, current)) throw createError({ statusCode: 403, statusMessage: 'The current password is not correct' })
  Object.assign(user, await hashPassword(password), { sessionVersion: user.sessionVersion + 1 })
  await saveAccounts(accounts)
  return { success: true, token: createSessionToken(user) }
})
