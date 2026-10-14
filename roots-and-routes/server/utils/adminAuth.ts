import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

const getExpectedToken = (): string => process.env.ADMIN_API_TOKEN || process.env.API_TOKEN || ''

// Compare digests so the comparison takes the same time regardless of where the tokens differ
const tokensMatch = (provided: string, expected: string): boolean =>
  timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest())

// For endpoints that answer everybody but give the administrator more (GET /api/gedcom/get)
export function isAdminRequest(event: H3Event): boolean {
  const expectedToken = getExpectedToken()
  const providedToken = (getHeader(event, 'authorization') || '').replace(/^Bearer\s+/i, '')
  return !!expectedToken && !!providedToken && tokensMatch(providedToken, expectedToken)
}

export function requireAdminToken(event: H3Event): void {
  const expectedToken = getExpectedToken()
  if (!expectedToken) {
    throw createError({ statusCode: 503, statusMessage: 'Set ADMIN_API_TOKEN to enable administration' })
  }

  const authorization = getHeader(event, 'authorization') || ''
  const providedToken = authorization.replace(/^Bearer\s+/i, '')
  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    throw createError({ statusCode: 401, statusMessage: 'Administrator authentication required' })
  }
}
