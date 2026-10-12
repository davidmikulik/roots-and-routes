// GEDCOM Import API Endpoint
import { parseGedcom } from '~~/utils/gedcom/parser'
import { applyKnownLocations, getUniqueGedcomLocations, normalizeLocationName } from '~~/utils/gedcom/locations'
import { validateFileSize, isGedcomFile, saveParsedGedcom, uploadGedcomFile } from '~~/server/utils/storage'
import { loadKnownLocations, saveKnownLocations } from '~~/server/utils/locationStorage'
import type { GedcomParseResult, GedcomFile } from '~~/types'
import type { UploadedFile } from '~~/types'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const maxFileSize = config.gedcom?.maxFileSize || 10 * 1024 * 1024
  let importStage = 'reading upload'
  try {
    const body = await readMultipartFormData(event)
    if (!body || !body.length) throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
    const fileData = body[0]
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
    const matchedNames = new Set(matchedLocations.map(location => normalizeLocationName(location.name)))
    const unresolvedLocations = uniqueLocations.filter(location => !matchedNames.has(normalizeLocationName(location)))
    const locationCatalog = new Map(knownLocations.map(location => [normalizeLocationName(location.name), location]))
    let addedLocations = 0
    for (const location of unresolvedLocations) {
      const key = normalizeLocationName(location)
      if (locationCatalog.has(key)) continue
      locationCatalog.set(key, { name: location, latitude: null, longitude: null })
      addedLocations++
    }
    if (addedLocations > 0) {
      importStage = 'saving newly discovered locations to private Blob catalog'
      await saveKnownLocations([...locationCatalog.values()])
    }
    
    importStage = 'saving GEDCOM file to server'
    // Use a fixed file ID for single-user mode
    const fixedFileId = 'current'
    const uploadedFile: UploadedFile = await uploadGedcomFile(file, filename, { overwrite: true, fileId: fixedFileId })
    
    importStage = 'saving parsed GEDCOM data to server'
    await saveParsedGedcom(parseResult.file, fixedFileId)
    
    return {
      success: true,
      message: 'GEDCOM file imported successfully',
      data: {
        file: { id: uploadedFile.id, name: uploadedFile.name, path: uploadedFile.path },
        locations: { unique: uniqueLocations, matched: matchedLocations, unresolved: unresolvedLocations, added: addedLocations },
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
