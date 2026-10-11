// GEDCOM Import API Endpoint
import { parseGedcom } from '~~/utils/gedcom/parser'
import { applyKnownLocations, getUniqueGedcomLocations, normalizeLocationName } from '~~/utils/gedcom/locations'
import { uploadGedcomFile, saveParsedGedcom, validateFileSize, isGedcomFile } from '~~/server/utils/storage'
import { loadKnownLocations } from '~~/server/utils/locationStorage'
import type { GedcomParseResult, UploadedFile } from '~~/types'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const maxFileSize = config.gedcom?.maxFileSize || 10 * 1024 * 1024
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
    const parseResult: GedcomParseResult = parseGedcom(fileText, { resolveXrefs: true, extractCoordinates: true })
    const uniqueLocations = getUniqueGedcomLocations(parseResult.file)
    const knownLocations = await loadKnownLocations()
    const matchedLocations = applyKnownLocations(parseResult.file, knownLocations)
    const matchedNames = new Set(matchedLocations.map(location => normalizeLocationName(location.name)))
    const unresolvedLocations = uniqueLocations.filter(location => !matchedNames.has(normalizeLocationName(location)))
    const uploadedFile: UploadedFile = await uploadGedcomFile(Buffer.from(file), filename, { overwrite: false })
    await saveParsedGedcom(parseResult.file, uploadedFile.id)
    return {
      success: true,
      message: 'GEDCOM file imported successfully',
      data: {
        file: uploadedFile,
        parseResult,
        locations: { unique: uniqueLocations, matched: matchedLocations, unresolved: unresolvedLocations },
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    console.error('GEDCOM import error:', error)
    throw createError({ statusCode: error.statusCode || 500, statusMessage: error.statusMessage || 'Internal Server Error', message: error.message || 'Failed to import GEDCOM file', fatal: error.fatal })
  }
})
