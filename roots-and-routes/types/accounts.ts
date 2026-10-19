// Users, permissions and databases (separate family trees), see server/utils/accounts.ts.
// A permission is one of four levels, from the lowest: demo (only the anonymized data), read, edit, admin.
// A user's role is the highest level they can have anywhere; a database shared with them has its own level and the
// lower of the two applies. The role "admin" also manages the users and every database.
export type AccessLevel = 'demo' | 'read' | 'edit' | 'admin'

export interface SessionUser {
  id: string
  username: string
  role: AccessLevel
}

export interface DatabaseGrant {
  userId: string
  username: string
  level: AccessLevel
}

// A database as the client sees it: the level is the one that applies to the current user
export interface DatabaseInfo {
  id: string
  name: string
  ownerId: string | null
  ownerName: string
  level: AccessLevel
  owned: boolean
  isPublic: boolean
  // Who else has access; only for those who manage the database (level admin)
  grants?: DatabaseGrant[]
}

// Administration of users (role admin)
export interface UserInfo {
  id: string
  username: string
  role: AccessLevel
  createdAt: string
  ownedDatabases: number
}

// GET /api/auth/me
export interface SessionInfo {
  user: SessionUser
  databases: DatabaseInfo[]
  defaultDatabaseId: string | null
}
