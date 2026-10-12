// GEDCOM Get API Endpoint - retrieve saved GEDCOM data
import { loadParsedGedcom, listUserFiles } from '~~/server/utils/storage'
import type { GedcomFile } from '~~/types'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const fileId = query.fileId as string | undefined
    
    let gedcomData: GedcomFile | null = null
    let fileInfo: { id: string; name: string; createdAt?: Date } | null = null
    
    // Try to load the fixed 'current' file first (single-user mode)
    if (!fileId) {
      gedcomData = await loadParsedGedcom('current')
      if (gedcomData) {
        fileInfo = { id: 'current', name: 'current' }
      }
    } else if (fileId) {
      // If fileId is provided, try to load that specific file
      gedcomData = await loadParsedGedcom(fileId)
      if (gedcomData) {
        fileInfo = { id: fileId, name: fileId }
      }
    }
    
    // If no file found with the above methods, try to find any file
    if (!gedcomData || !fileInfo) {
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
      
      gedcomData = await loadParsedGedcom(latestFile.id)
      fileInfo = {
        id: latestFile.id,
        name: latestFile.name,
        createdAt: latestFile.createdAt
      }
    }
    
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
        fileInfo
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
