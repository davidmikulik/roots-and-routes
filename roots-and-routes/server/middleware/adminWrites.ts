// Every data-changing API request (and everything under /api/admin) needs the admin token.
// Read-only requests (GET/HEAD/OPTIONS) outside /api/admin stay public.
import { requireAdminToken } from '~~/server/utils/adminAuth'

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return
  if (READ_METHODS.has(event.method) && !path.startsWith('/api/admin/')) return
  requireAdminToken(event)
})
