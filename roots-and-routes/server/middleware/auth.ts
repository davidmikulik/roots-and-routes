// Authentication Middleware
import type { H3Event } from 'h3'

export default defineEventHandler((event: H3Event) => {
  // Admin routes use ADMIN_API_TOKEN (server/middleware/adminWrites.ts)
  if (getRequestURL(event).pathname.startsWith('/api/admin/')) return
  const config = useRuntimeConfig()
  const apiToken = config.public?.apiToken || process.env.API_TOKEN
  if (!apiToken) return
  const authHeader = getHeader(event, 'authorization')
  const providedToken = authHeader?.replace('Bearer ', '') || getQuery(event).token
  if (providedToken !== apiToken) {
    event.node.res.statusCode = 401
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', fatal: true })
  }
})

export function getUserId(event: H3Event): string | null {
  const userId = getHeader(event, 'x-user-id') || getQuery(event).userId
  return userId && typeof userId === 'string' ? userId : null
}

export function isAuthenticated(event: H3Event): boolean {
  const config = useRuntimeConfig()
  const apiToken = config.public?.apiToken || process.env.API_TOKEN
  if (!apiToken) return true
  const authHeader = getHeader(event, 'authorization')
  const providedToken = authHeader?.replace('Bearer ', '') || getQuery(event).token
  return providedToken === apiToken
}

export function requireAuth(handler: (event: H3Event) => Promise<any>) {
  return defineEventHandler(async (event: H3Event) => {
    if (!isAuthenticated(event)) {
      event.node.res.statusCode = 401
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized - Authentication required', fatal: true })
    }
    return await handler(event)
  })
}

export function optionalAuth(handler: (event: H3Event, userId: string | null) => Promise<any>) {
  return defineEventHandler(async (event: H3Event) => {
    const userId = getUserId(event)
    return await handler(event, userId)
  })
}

export function extractApiKey(event: H3Event): string | null {
  const authHeader = getHeader(event, 'authorization')
  const queryToken = getQuery(event).token
  return authHeader?.replace('Bearer ', '') || (typeof queryToken === 'string' ? queryToken : null)
}

export function validateApiKey(event: H3Event): boolean {
  const config = useRuntimeConfig()
  const apiToken = config.public?.apiToken || process.env.API_TOKEN
  const providedToken = extractApiKey(event)
  if (!apiToken) return true
  return providedToken === apiToken
}
