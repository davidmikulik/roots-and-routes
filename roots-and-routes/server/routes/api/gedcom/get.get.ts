// GEDCOM Get API Endpoint - retrieve saved GEDCOM data
import { loadParsedGedcom, listUserFiles } from '~~/server/utils/storage'
import type { GedcomFile } from '~~/types'

export default defineEventHandler(async (event) => {
  try {
    // For now, get the first available file (single-user mode)
    // In future, this should be user-specific
    const files = await listUserFiles()
    
    if (files.length === 0) {
      return {
        success: false,
        message: 'No GEDCOM file found',
        data: null
      }
    }
    
    // Get the most recently uploaded file
    const latestFile = files.sort((a, b) => 
      (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    )[0]
    
    if (!latestFile?.id) {
      return {
        success: false,
        message: 'No valid GEDCOM file found',
        data: null
      }
    }
    
    const gedcomData = await loadParsedGedcom(latestFile.id)
    
    if (!gedcomData) {
      return {
        success: false,
        message: 'Failed to load GEDCOM data',
        data: null
      }
    }
    
    return {
      success: true,
      message: 'GEDCOM data loaded successfully',
      data: {
        file: gedcomData,
        fileInfo: {
          id: latestFile.id,
          name: latestFile.name,
          createdAt: latestFile.createdAt
        }
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
