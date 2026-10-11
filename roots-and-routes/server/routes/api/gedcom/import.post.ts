// GEDCOM Import API Endpoint
import { parseGedcom } from '~~/utils/gedcom/parser'
import { applyKnownLocations, getUniqueGedcomLocations, normalizeLocationName } from '~~/utils/gedcom/locations'
import { validateFileSize, isGedcomFile } from '~~/server/utils/storage'
import { loadKnownLocations } from '~~/server/utils/locationStorage'
import type { GedcomParseResult } from '~~/types'

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
    return {
      success: true,
      message: 'GEDCOM file imported successfully',
      data: {
        parseResult,
        locations: { unique: uniqueLocations, matched: matchedLocations, unresolved: unresolvedLocations },
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
