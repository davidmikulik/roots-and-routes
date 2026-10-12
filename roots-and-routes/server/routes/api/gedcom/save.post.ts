// GEDCOM Save API Endpoint - save parsed GEDCOM data to server
import { saveParsedGedcom } from '~~/server/utils/storage'
import type { GedcomFile } from '~~/types'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ fileId: string; fileData: GedcomFile }>(event)
    
    if (!body.fileId) {
      throw createError({ statusCode: 400, statusMessage: 'fileId is required' })
    }
    
    if (!body.fileData) {
      throw createError({ statusCode: 400, statusMessage: 'fileData is required' })
    }
    
    await saveParsedGedcom(body.fileData, body.fileId)
    
    return {
      success: true,
      message: 'GEDCOM data saved successfully',
      data: {
        fileId: body.fileId
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
