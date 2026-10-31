// Personal access keys (Authorization: Bearer rr_…, server/utils/accounts.ts) reach only the endpoints automated work
// needs: reading the tree of their database, sending batches of changes, reading the pending batches, the history and
// the known places, and storing images for sources. Users, databases, backups, other keys and approving changes stay
// for a logged-in person. A wrong, revoked or expired key, or a key used for another database, gets 401 and nothing
// more. The endpoints check the level on the database themselves (server/utils/access.ts).
import { isApiToken } from '~~/server/utils/accounts'
import { getActor } from '~~/server/utils/access'

const ALLOWED: { method: string; path: RegExp }[] = [
  { method: 'GET', path: /^\/api\/gedcom\/get$/ },
  { method: 'POST', path: /^\/api\/gedcom\/changes$/ },
  { method: 'GET', path: /^\/api\/gedcom\/pending$/ },
  { method: 'GET', path: /^\/api\/gedcom\/history(\/\d+)?$/ },
  { method: 'GET', path: /^\/api\/admin\/locations$/ },
  { method: 'GET', path: /^\/api\/auth\/me$/ },
  { method: 'GET', path: /^\/api\/media\/[^/]+$/ },
  { method: 'POST', path: /^\/api\/media\/(upload|copy)$/ },
]

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  const token = (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!isApiToken(token)) return
  const actor = await getActor(event)
  if (!actor?.apiToken) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const requested = String(getHeader(event, 'x-database') || '').trim()
  if (requested && requested !== actor.apiToken.databaseId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const method = event.method === 'HEAD' ? 'GET' : event.method
  if (method === 'OPTIONS') return
  if (!ALLOWED.some(rule => rule.method === method && rule.path.test(path))) {
    throw createError({ statusCode: 403, statusMessage: 'Not available with an access key' })
  }
})
