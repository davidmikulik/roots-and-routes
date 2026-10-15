// GEDCOM Import API Endpoint
import { parseGedcom } from '~~/utils/gedcom/parser'
import { applyKnownLocations, getPlaceCoordinates, getUniqueGedcomLocations, learnKnownLocations, normalizeLocationName } from '~~/utils/gedcom/locations'
import { validateFileSize, isGedcomFile, saveParsedGedcom, uploadGedcomFile } from '~~/server/utils/storage'
import { createBackup, clampBackupCount } from '~~/server/utils/backups'
import { loadKnownLocations, saveKnownLocations } from '~~/server/utils/locationStorage'
import type { GedcomParseResult, GedcomFile } from '~~/types'
import type { UploadedFile } from '~~/types'
import { requireAdminToken } from '~~/server/utils/adminAuth'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
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
    
    // Use a fixed file ID for single-user mode
    const fixedFileId = 'current'
    let uploadedFile: UploadedFile | null = null
    let backupId: string | null = null
    if (!analyseOnly) {
      if (field('backupOnImport') === 'true') {
        importStage = 'backing up the current tree'
        backupId = await createBackup(clampBackupCount(field('backupCount')))
      }
      importStage = 'saving GEDCOM file to server'
      uploadedFile = await uploadGedcomFile(file, filename, { overwrite: true, fileId: fixedFileId })

      importStage = 'saving parsed GEDCOM data to server'
      await saveParsedGedcom(parseResult.file, fixedFileId)
    }

    return {
      success: true,
      message: 'GEDCOM file imported successfully',
      data: {
        file: { id: fixedFileId, name: uploadedFile?.name || filename, path: uploadedFile?.path },
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
