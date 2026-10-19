import { createHash, timingSafeEqual } from 'node:crypto'

// ADMIN_API_TOKEN: the first login (creates the first administrator, server/utils/accounts.ts) and a Bearer token
// with the rights of an administrator for scripts and recovery (server/utils/access.ts)
const getExpectedToken = (): string => process.env.ADMIN_API_TOKEN || process.env.API_TOKEN || ''

// Compare digests so the comparison takes the same time regardless of where the tokens differ
const tokensMatch = (provided: string, expected: string): boolean =>
  timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(expected).digest())

export function tokenMatchesAdmin(token: string): boolean {
  const expectedToken = getExpectedToken()
  return !!expectedToken && !!token && tokensMatch(token, expectedToken)
}
