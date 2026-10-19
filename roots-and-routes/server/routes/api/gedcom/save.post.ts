// GEDCOM Save API Endpoint - saves the tree of the database of the request (level "edit")
import { saveParsedGedcom } from '~~/server/utils/storage'
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { deserializeGedcomFile, type SerializedGedcomFile } from '~~/utils/gedcom/serialize'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'edit')
  try {
    const body = await readBody<{ fileId?: string; fileData: SerializedGedcomFile }>(event)

    if (!body.fileData) {
      throw createError({ statusCode: 400, statusMessage: 'fileData is required' })
    }

    await saveParsedGedcom(deserializeGedcomFile(body.fileData), databasePaths(db).parsed)

    return {
      success: true,
      message: 'GEDCOM data saved successfully',
      data: {
        fileId: 'current',
        databaseId: db.id,
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    console.error('Failed to save GEDCOM data:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to save GEDCOM data',
      message: error.message || 'Failed to save GEDCOM data',
    })
  }
})
