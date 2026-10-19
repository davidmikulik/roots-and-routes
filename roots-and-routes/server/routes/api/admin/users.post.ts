// A new user (administrators only), optionally with their own new database
import { hashPassword, loadAccounts, newId, saveAccounts } from '~~/server/utils/accounts'
import { requireActor } from '~~/server/utils/access'
import { checkDatabaseName, checkLevel, checkPassword, checkUsername, createDatabaseRecord, userInfo } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'admin')
  const body = await readBody<{ username?: unknown; password?: unknown; role?: unknown; databaseName?: unknown }>(event)
  const accounts = await loadAccounts()
  const username = checkUsername(accounts, body?.username)
  const password = checkPassword(body?.password)
  const role = checkLevel(body?.role)
  const user = { id: newId(), username, role, ...await hashPassword(password), sessionVersion: 0, createdAt: new Date().toISOString() }
  accounts.users.push(user)
  if (typeof body?.databaseName === 'string' && body.databaseName.trim()) {
    accounts.databases.push(createDatabaseRecord(checkDatabaseName(body.databaseName), user.id))
  }
  await saveAccounts(accounts)
  console.log(`[AUTH] User ${username} (${role}) created`)
  return { success: true, user: userInfo(accounts, user) }
})
