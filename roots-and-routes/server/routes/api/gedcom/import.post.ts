// GEDCOM Import API Endpoint
import { parseGedcom } from '~~/utils/gedcom/parser'
import { applyKnownLocations, getPlaceCoordinates, getUniqueGedcomLocations, learnKnownLocations, normalizeLocationName } from '~~/utils/gedcom/locations'
import { validateFileSize, isGedcomFile, saveParsedGedcom, saveOriginalGedcom } from '~~/server/utils/storage'
import { createBackup, clampBackupCount } from '~~/server/utils/backups'
import { loadKnownLocations, saveKnownLocations } from '~~/server/utils/locationStorage'
import type { GedcomParseResult, GedcomFile } from '~~/types'
import { databasePaths, requireDatabase } from '~~/server/utils/access'

// Into the database of the request: replacing its tree needs the level "admin", analysing a file for a merge "edit"
export default defineEventHandler(async (event) => {
  const { db, level } = await requireDatabase(event, 'edit')
  const config = useRuntimeConfig()
  const maxFileSize = config.gedcom?.maxFileSize || 10 * 1024 * 1024
  let importStage = 'reading upload'
  try {
    const body = await readMultipartFormData(event)
    if (!body || !body.length) throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
    // The file part has a filename; the other parts are plain form fields (mode, backupOnImport, backupCount)
    const fileData = body.find(part => part.filename)
    const field = (name: string): string => body.find(part => part.name === name && !part.filename)?.data.toString('utf8') || ''
    // 'merge' only analyses the file: the client merges it with the current tree and saves the result itself
    const analyseOnly = field('mode') === 'merge'
    if (!analyseOnly && level !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Replacing the tree needs the permission to administer the database' })
    if (!fileData) throw createError({ statusCode: 400, statusMessage: 'No file provided' })
    const file = fileData.data
    const filename = fileData.filename || 'unknown.ged'
    const mimeType = fileData.type || 'application/octet-stream'
    const sizeValidation = validateFileSize(file.length, maxFileSize)
    if (!sizeValidation.valid) throw createError({ statusCode: 400, statusMessage: 'File too large', message: sizeValidation.message })
    if (!isGedcomFile(filename)) throw createError({ statusCode: 400, statusMessage: 'Invalid file type' })
    const fileText = Buffer.from(file).toString('utf8')
    const isValidGedcom = fileText.includes('0 HEAD') || fileText.includes('0 @') || fileText.match(/\b(INDI|FAM|SOUR)\b/)
    if (!isValidGedcom) throw createError({ statusCode: 400, statusMessage: 'Invalid GEDCOM content' })
    importStage = 'parsing GEDCOM'
    const parseResult: GedcomParseResult = parseGedcom(fileText, { resolveXrefs: true, extractCoordinates: true })
    const uniqueLocations = getUniqueGedcomLocations(parseResult.file)
    importStage = 'loading known locations from Blob'
    const knownLocations = await loadKnownLocations()
    const matchedLocations = applyKnownLocations(parseResult.file, knownLocations)
    // The catalog learns the file's places, with the file's coordinates where it has them
    const learned = learnKnownLocations(knownLocations, parseResult.file)
    const placeCoordinates = getPlaceCoordinates(parseResult.file)
    const unresolvedLocations = uniqueLocations.filter(location => !placeCoordinates.get(normalizeLocationName(location))?.coordinates)
    const addedLocations = learned.added
    if (learned.added > 0 || learned.updated > 0) {
      importStage = 'saving newly discovered locations to private Blob catalog'
      await saveKnownLocations(learned.catalog)
    }
    
    const fixedFileId = 'current'
    const paths = databasePaths(db)
    let backupId: string | null = null
    if (!analyseOnly) {
      if (field('backupOnImport') === 'true') {
        importStage = 'backing up the current tree'
        backupId = await createBackup(db, clampBackupCount(field('backupCount')))
      }
      importStage = 'saving GEDCOM file to server'
      await saveOriginalGedcom(paths.original, file)

      importStage = 'saving parsed GEDCOM data to server'
      await saveParsedGedcom(parseResult.file, paths.parsed)
    }

    return {
      success: true,
      message: 'GEDCOM file imported successfully',
      data: {
        file: { id: fixedFileId, name: filename, databaseId: db.id },
        backupId,
        locations: { unique: uniqueLocations, matched: matchedLocations, unresolved: unresolvedLocations, added: addedLocations, updated: learned.updated },
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    console.error(`GEDCOM import failed while ${importStage}:`, error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || `GEDCOM import failed while ${importStage}`,
      message: error.message || 'Failed to import GEDCOM file',
      fatal: error.fatal,
    })
  }
})
