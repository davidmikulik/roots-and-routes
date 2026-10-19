// Ordering of the permission levels (types/accounts.ts), shared by the client and the server
import type { AccessLevel } from '~~/types/accounts'

export const ACCESS_LEVELS: AccessLevel[] = ['demo', 'read', 'edit', 'admin']

export const isAccessLevel = (value: unknown): value is AccessLevel => ACCESS_LEVELS.includes(value as AccessLevel)

// The level is at least `min` (no level never is)
export const levelAtLeast = (level: AccessLevel | null | undefined, min: AccessLevel): boolean =>
  !!level && ACCESS_LEVELS.indexOf(level) >= ACCESS_LEVELS.indexOf(min)

export const lowerLevel = (first: AccessLevel, second: AccessLevel): AccessLevel =>
  ACCESS_LEVELS.indexOf(first) <= ACCESS_LEVELS.indexOf(second) ? first : second

// User names: letters, digits, dot, dash, underscore and @, 2–64 characters, compared without case
export const normalizeUsername = (value: string): string => value.trim().toLowerCase()
export const isValidUsername = (value: string): boolean => /^[\p{L}\p{N}._@-]{2,64}$/u.test(value.trim())
export const MIN_PASSWORD_LENGTH = 8
