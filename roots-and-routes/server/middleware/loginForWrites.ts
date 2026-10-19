// Every data-changing API request needs a logged-in user (a session token or ADMIN_API_TOKEN); the endpoint itself
// then checks the permission on the database (server/utils/access.ts). Only logging in is open to everybody.
import { requireActor } from '~~/server/utils/access'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const OPEN_PATHS = new Set(['/api/auth/login'])

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || READ_METHODS.has(event.method) || OPEN_PATHS.has(path)) return
  await requireActor(event)
})
