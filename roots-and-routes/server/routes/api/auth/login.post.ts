// Login with a user name and password; answers a session token and what the user can open.
// While no user exists, the password ADMIN_API_TOKEN creates the first administrator with the given name
// (and makes them the owner of the tree from before the accounts, see server/utils/accounts.ts).
import { createSessionToken, findUserByName, hashPassword, loadAccounts, newId, passwordMatches, saveAccounts, LEGACY_DATABASE_ID } from '~~/server/utils/accounts'
import { sessionInfo } from '~~/server/utils/access'
import { tokenMatchesAdmin } from '~~/server/utils/adminAuth'
import { isValidUsername } from '~~/utils/accessLevels'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: unknown; password?: unknown }>(event)
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!username || !password) throw createError({ statusCode: 400, statusMessage: 'User name and password are required' })

  const accounts = await loadAccounts()
  let user = findUserByName(accounts, username)
  if (!user && accounts.users.length === 0) {
    if (!tokenMatchesAdmin(password)) throw createError({ statusCode: 401, statusMessage: 'First login: use ADMIN_API_TOKEN as the password' })
    if (!isValidUsername(username)) throw createError({ statusCode: 400, statusMessage: 'Invalid user name' })
    user = { id: newId(), username, role: 'admin', ...await hashPassword(password), sessionVersion: 0, createdAt: new Date().toISOString() }
    accounts.users.push(user)
    const legacy = accounts.databases.find(db => db.id === LEGACY_DATABASE_ID)
    if (legacy && !legacy.ownerId) legacy.ownerId = user.id
    await saveAccounts(accounts)
    console.log(`[AUTH] First administrator ${username} created`)
  } else if (!user || !await passwordMatches(user, password)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid user name or password' })
  }

  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const actor = { id: user.id, username: user.username, role: user.role }
  return { token: createSessionToken(user), ...sessionInfo(accounts, actor) }
})
