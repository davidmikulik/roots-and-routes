// GEDCOM Get API Endpoint - retrieve saved GEDCOM data
import { loadParsedGedcom, listUserFiles, getFileText } from '~~/server/utils/storage'
import { parseGedcom } from '~~/utils/gedcom/parser'
import type { GedcomFile, GedcomParseResult } from '~~/types'

// Helper function to re-parse original GEDCOM file if parsed data is corrupted
async function tryReparseFromOriginal(fileId: string, uploadDir: string): Promise<GedcomFile | null> {
  try {
    // Try to find the original .ged or .gedcom file
    const extensions = ['.ged', '.gedcom']
    for (const ext of extensions) {
      const originalPath = `${uploadDir}/${fileId}${ext}`
      try {
        const content = await getFileText(originalPath)
        console.log(`[GEDCOM GET] Re-parsing original file ${originalPath}`)
        const result: GedcomParseResult = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
        return result.file
      } catch (error) {
        // Try with 'current' as filename
        if (fileId === 'current') {
          const currentPath = `${uploadDir}/current${ext}`
          try {
            const content = await getFileText(currentPath)
            console.log(`[GEDCOM GET] Re-parsing original file ${currentPath}`)
            const result: GedcomParseResult = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
            return result.file
          } catch (e) {
            // continue
          }
        }
      }
    }
    return null
  } catch (error) {
    console.error('[GEDCOM GET] Failed to re-parse from original:', error)
    return null
  }
}

// Helper to check if parsed data is corrupted (empty maps but metadata shows counts)
function isParsedDataCorrupted(file: GedcomFile): boolean {
  const hasIndividualsMeta = file.metadata.totalIndividuals > 0
  const hasFamiliesMeta = file.metadata.totalFamilies > 0
  const hasIndividualsData = file.individuals.size > 0
  const hasFamiliesData = file.families.size > 0
  
  // If metadata says there should be data but maps are empty, data is corrupted
  return (hasIndividualsMeta && !hasIndividualsData) || (hasFamiliesMeta && !hasFamiliesData)
}

export default defineEventHandler(async (event) => {
  console.log('[GEDCOM GET] Starting...')
  try {
    const query = getQuery(event)
    const fileId = query.fileId as string | undefined
    const config = useRuntimeConfig()
    const uploadDir = config.gedcom?.uploadDir || 'uploads/gedcom'
    console.log(`[GEDCOM GET] fileId: ${fileId || 'none'}`)
    
    let gedcomData: GedcomFile | null = null
    let fileInfo: { id: string; name: string; createdAt?: Date } | null = null
    
    // Try to load the fixed 'current' file first (single-user mode)
    if (!fileId) {
      console.log('[GEDCOM GET] Trying to load current...')
      gedcomData = await loadParsedGedcom('current')
      if (gedcomData) {
        console.log(`[GEDCOM GET] Loaded current with ${gedcomData.metadata.totalIndividuals} individuals, ${gedcomData.individuals.size} in map`)
        // Check if data is corrupted (empty maps but metadata shows counts)
        if (isParsedDataCorrupted(gedcomData)) {
          console.log('[GEDCOM GET] Detected corrupted parsed data for current, attempting to re-parse...')
          const reparsed = await tryReparseFromOriginal('current', uploadDir)
          if (reparsed) {
            gedcomData = reparsed
            console.log(`[GEDCOM GET] Successfully re-parsed, got ${gedcomData.individuals.size} individuals`)
          } else {
            console.log('[GEDCOM GET] Failed to re-parse, using corrupted data')
          }
        }
        fileInfo = { id: 'current', name: 'current' }
      } else {
        console.log('[GEDCOM GET] Current file not found')
      }
    } else if (fileId) {
      console.log(`[GEDCOM GET] Trying to load fileId: ${fileId}`)
      gedcomData = await loadParsedGedcom(fileId)
      if (gedcomData) {
        console.log(`[GEDCOM GET] Loaded ${fileId} with ${gedcomData.metadata.totalIndividuals} individuals, ${gedcomData.individuals.size} in map`)
        // Check if data is corrupted
        if (isParsedDataCorrupted(gedcomData)) {
          console.log(`[GEDCOM GET] Detected corrupted parsed data for ${fileId}, attempting to re-parse...`)
          const reparsed = await tryReparseFromOriginal(fileId, uploadDir)
          if (reparsed) {
            gedcomData = reparsed
            console.log(`[GEDCOM GET] Successfully re-parsed ${fileId}, got ${gedcomData.individuals.size} individuals`)
          } else {
            console.log(`[GEDCOM GET] Failed to re-parse ${fileId}, using corrupted data`)
          }
        }
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
        console.log(`[GEDCOM GET] Loaded latest file with ${gedcomData.metadata.totalIndividuals} individuals, ${gedcomData.individuals.size} in map`)
        // Check if data is corrupted
        if (isParsedDataCorrupted(gedcomData)) {
          console.log(`[GEDCOM GET] Detected corrupted parsed data for latest file, attempting to re-parse...`)
          const reparsed = await tryReparseFromOriginal(latestFile.id, uploadDir)
          if (reparsed) {
            gedcomData = reparsed
            console.log(`[GEDCOM GET] Successfully re-parsed latest file, got ${gedcomData.individuals.size} individuals`)
          } else {
            console.log('[GEDCOM GET] Failed to re-parse latest file, using corrupted data')
          }
        }
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
