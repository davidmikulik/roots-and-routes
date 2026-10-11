import type { H3Event } from 'h3'

export function requireAdminToken(event: H3Event): void {
  const expectedToken = process.env.ADMIN_API_TOKEN || process.env.API_TOKEN
  if (!expectedToken) {
    throw createError({ statusCode: 503, statusMessage: 'Set ADMIN_API_TOKEN to enable location administration' })
  }

  const authorization = getHeader(event, 'authorization') || ''
  const providedToken = authorization.replace(/^Bearer\s+/i, '')
  if (providedToken !== expectedToken) {
    throw createError({ statusCode: 401, statusMessage: 'Administrator authentication required' })
  }
}
