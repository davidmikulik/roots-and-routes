// GEDCOM Get API Endpoint - the tree of the database of the request (header X-Database, otherwise the default one,
// see server/utils/access.ts). Full data from the level "read" up; visitors and the level "demo" get an anonymized copy.
import { loadParsedGedcom, readOriginalGedcom } from '~~/server/utils/storage'
import { parseGedcom } from '~~/utils/gedcom/parser'
import { serializeGedcomFile } from '~~/utils/gedcom/serialize'
import { databasePaths, databaseInfo, resolveDatabase } from '~~/server/utils/access'
import { anonymizeGedcomFile } from '~~/server/utils/anonymizeGedcom'
import { levelAtLeast } from '~~/utils/accessLevels'
import type { GedcomFile } from '~~/types'

// Parsed data from before the Map serialization fix have empty maps although the metadata count people
function isParsedDataCorrupted(file: GedcomFile): boolean {
  return (file.metadata.totalIndividuals > 0 && file.individuals.size === 0) || (file.metadata.totalFamilies > 0 && file.families.size === 0)
}

export default defineEventHandler(async (event) => {
  console.log('[GEDCOM GET] Starting...')
  // The answer depends on the user and the database: never let a cache hand someone's data to somebody else
  setResponseHeaders(event, { 'cache-control': 'private, no-store', vary: 'Authorization, X-Database' })
  try {
    const access = await resolveDatabase(event, { fallback: true })
    if (!access) return { success: false, message: 'No database is available', data: null }
    const { db, level, accounts, actor } = access
    const paths = databasePaths(db)
    const full = levelAtLeast(level, 'read')
    const database = databaseInfo(accounts, actor, db, level)
    console.log(`[GEDCOM GET] Database ${db.id} (${level})`)

    let gedcomData = await loadParsedGedcom(paths.parsed)
    if (!gedcomData || isParsedDataCorrupted(gedcomData)) {
      if (gedcomData) console.log(`[GEDCOM GET] WARNING: Corrupted parsed data: ${gedcomData.metadata.totalIndividuals} individuals in metadata, ${gedcomData.individuals.size} in map`)
      const original = await readOriginalGedcom(paths.original)
      if (original) {
        console.log(`[GEDCOM GET] Re-parsing original file ${paths.original}`)
        gedcomData = parseGedcom(original, { resolveXrefs: true, extractCoordinates: true }).file
      }
    }
    if (!gedcomData) {
      console.log('[GEDCOM GET] No tree in this database')
      return { success: false, message: 'No GEDCOM file found', data: { database } }
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
