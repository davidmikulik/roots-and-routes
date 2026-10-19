// Changes a user (administrators only): name, role, new password. A new password ends the user's sessions.
import { hashPassword, loadAccounts, saveAccounts } from '~~/server/utils/accounts'
import { requireActor } from '~~/server/utils/access'
import { checkLevel, checkPassword, checkUsername, isLastAdmin, userInfo } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'admin')
  const body = await readBody<{ username?: unknown; role?: unknown; password?: unknown }>(event)
  const accounts = await loadAccounts()
  const user = accounts.users.find(candidate => candidate.id === getRouterParam(event, 'id'))
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (body?.username !== undefined) user.username = checkUsername(accounts, body.username, user.id)
  if (body?.role !== undefined) {
    const role = checkLevel(body.role)
    if (role !== 'admin' && user.role === 'admin' && isLastAdmin(accounts, user.id)) {
      throw createError({ statusCode: 409, statusMessage: 'The last administrator cannot lose the role' })
    }
    user.role = role
  }
  if (body?.password !== undefined) Object.assign(user, await hashPassword(checkPassword(body.password)), { sessionVersion: user.sessionVersion + 1 })
  await saveAccounts(accounts)
  return { success: true, user: userInfo(accounts, user) }
})
