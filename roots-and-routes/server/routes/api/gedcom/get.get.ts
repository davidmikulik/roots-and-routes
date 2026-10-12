// GEDCOM Get API Endpoint - retrieve saved GEDCOM data
import { loadParsedGedcom, listUserFiles } from '~~/server/utils/storage'
import type { GedcomFile } from '~~/types'

export default defineEventHandler(async (event) => {
  console.log('[GEDCOM GET] Starting...')
  try {
    const query = getQuery(event)
    const fileId = query.fileId as string | undefined
    console.log(`[GEDCOM GET] fileId: ${fileId || 'none'}`)
    
    let gedcomData: GedcomFile | null = null
    let fileInfo: { id: string; name: string; createdAt?: Date } | null = null
    
    // Try to load the fixed 'current' file first (single-user mode)
    if (!fileId) {
      console.log('[GEDCOM GET] Trying to load current...')
      gedcomData = await loadParsedGedcom('current')
      if (gedcomData) {
        console.log(`[GEDCOM GET] Loaded current with ${gedcomData.metadata.totalIndividuals} individuals`)
        fileInfo = { id: 'current', name: 'current' }
      } else {
        console.log('[GEDCOM GET] Current file not found')
      }
    } else if (fileId) {
      console.log(`[GEDCOM GET] Trying to load fileId: ${fileId}`)
      gedcomData = await loadParsedGedcom(fileId)
      if (gedcomData) {
        console.log(`[GEDCOM GET] Loaded ${fileId} with ${gedcomData.metadata.totalIndividuals} individuals`)
        fileInfo = { id: fileId, name: fileId }
      } else {
        console.log(`[GEDCOM GET] File ${fileId} not found`)
      }
    }
    
    // If no file found with the above methods, try to find any file
    if (!gedcomData || !fileInfo) {
      console.log('[GEDCOM GET] Trying to list all files...')
      const files = await listUserFiles()
      console.log(`[GEDCOM GET] Found ${files.length} files`)
      
      if (files.length === 0) {
        console.log('[GEDCOM GET] No files found')
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
      
      console.log(`[GEDCOM GET] Latest file: ${latestFile.id}`)
      if (!latestFile?.id) {
        console.log('[GEDCOM GET] No valid latest file')
        return {
          success: false,
          message: 'No valid GEDCOM file found',
          data: null
        }
      }
      
      gedcomData = await loadParsedGedcom(latestFile.id)
      if (gedcomData) {
        console.log(`[GEDCOM GET] Loaded latest file with ${gedcomData.metadata.totalIndividuals} individuals`)
      } else {
        console.log(`[GEDCOM GET] Failed to load latest file ${latestFile.id}`)
      }
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
    
    console.log(`[GEDCOM GET] Returning data with ${gedcomData?.metadata.totalIndividuals || 0} individuals`)
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
