// Deletes a database with its tree, backups and attachments (whoever manages it: the owner or an administrator)
import { loadAccounts, saveAccounts } from '~~/server/utils/accounts'
import { getActor, levelOn } from '~~/server/utils/access'
import { deleteDatabaseFiles } from '~~/server/utils/userAdmin'

export default defineEventHandler(async (event) => {
  const actor = await getActor(event)
  const accounts = await loadAccounts()
  const db = accounts.databases.find(candidate => candidate.id === getRouterParam(event, 'id'))
  if (!db) throw createError({ statusCode: 404, statusMessage: 'Database not found' })
  if (levelOn(accounts, actor, db) !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
  // The record goes first: a failure while deleting the files leaves orphaned files, never a database without them
  accounts.databases = accounts.databases.filter(candidate => candidate.id !== db.id)
  if (accounts.publicDatabaseId === db.id) accounts.publicDatabaseId = null
  await saveAccounts(accounts)
  const files = await deleteDatabaseFiles(db)
  console.log(`[AUTH] Database ${db.name} (${db.id}) deleted with ${files} files`)
  return { success: true, files }
})
