// GEDCOM Get API Endpoint - the tree of the database of the request (header X-Database, otherwise the default one,
// see server/utils/access.ts). Full data from the level "read" up; visitors and the level "demo" get an anonymized copy.
import { serializeGedcomFile } from '~~/utils/gedcom/serialize'
import { loadTree } from '~~/server/utils/treeStore'
import { databaseInfo, resolveDatabase } from '~~/server/utils/access'
import { anonymizeGedcomFile } from '~~/server/utils/anonymizeGedcom'
import { levelAtLeast } from '~~/utils/accessLevels'

export default defineEventHandler(async (event) => {
  console.log('[GEDCOM GET] Starting...')
  // The answer depends on the user and the database: never let a cache hand someone's data to somebody else
  setResponseHeaders(event, { 'cache-control': 'private, no-store', vary: 'Authorization, X-Database' })
  try {
    const access = await resolveDatabase(event, { fallback: true })
    if (!access) return { success: false, message: 'No database is available', data: null }
    const { db, level, accounts, actor } = access
    const full = levelAtLeast(level, 'read')
    const database = databaseInfo(accounts, actor, db, level)
    console.log(`[GEDCOM GET] Database ${db.id} (${level})`)

    // The parsed tree, or the original parsed again when the stored one is missing or from before the Map fix
    const { file: gedcomData, revision } = await loadTree(db)
    if (!gedcomData) {
      console.log('[GEDCOM GET] No tree in this database')
      return { success: false, message: 'No GEDCOM file found', data: { database, revision } }
    }

    console.log(`[GEDCOM GET] Returning ${full ? 'full' : 'anonymized'} data with ${gedcomData.metadata.totalIndividuals || 0} individuals`)
    return {
      success: true,
      message: 'GEDCOM data loaded successfully',
      data: {
        // Maps would be lost in JSON (become {}), send them as entry arrays.
        // Visitors and the level "demo" get an anonymized copy (names → initials, dates → year, no places)
        file: serializeGedcomFile(full ? gedcomData : anonymizeGedcomFile(gedcomData)),
        fileInfo: { id: 'current', name: db.name },
        database,
        anonymized: !full,
        // Every save sends it back (baseRevision); the server refuses a save based on an outdated tree
        revision,
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    console.error('Failed to load GEDCOM data:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to load GEDCOM data',
      message: error.message || 'Failed to load GEDCOM data',
    })
  }
})
