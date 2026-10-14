// GEDCOM Get API Endpoint - retrieve saved GEDCOM data
import { loadParsedGedcom, listUserFiles, getFileText } from '~~/server/utils/storage'
import { parseGedcom } from '~~/utils/gedcom/parser'
import { serializeGedcomFile } from '~~/utils/gedcom/serialize'
import { isAdminRequest } from '~~/server/utils/adminAuth'
import { anonymizeGedcomFile } from '~~/server/utils/anonymizeGedcom'
import type { GedcomFile, GedcomParseResult } from '~~/types'

// Helper function to re-parse original GEDCOM file if parsed data is corrupted
async function tryReparseFromOriginal(fileId: string, uploadDir: string): Promise<GedcomFile | null> {
  try {
    // Try to find the original .ged or .gedcom file
    const extensions = ['.ged', '.gedcom']
    
    // For 'current', also try without prefix
    const fileIdsToTry = fileId === 'current' ? ['current', ''] : [fileId]
    
    for (const tryFileId of fileIdsToTry) {
      for (const ext of extensions) {
        const path = tryFileId ? `${uploadDir}/${tryFileId}${ext}` : `${uploadDir}/current${ext}`
        try {
          const content = await getFileText(path)
          console.log(`[GEDCOM GET] Re-parsing original file ${path}`)
          const result: GedcomParseResult = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
          return result.file
        } catch (error) {
          // Try alternative path patterns
          // Some files might be stored as uploads/gedcom/FILENAME (without extension in the ID)
          if (fileId && fileId !== 'current') {
            try {
              const path2 = `${uploadDir}/${fileId}`
              const content = await getFileText(path2)
              console.log(`[GEDCOM GET] Re-parsing original file ${path2}`)
              const result: GedcomParseResult = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
              return result.file
            } catch (e2) {
              // continue
            }
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
  // The answer depends on the Authorization header: never let a cache hand the administrator's data to a visitor
  setResponseHeaders(event, { 'cache-control': 'private, no-store', vary: 'Authorization' })
  const admin = isAdminRequest(event)
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
          console.log(`[GEDCOM GET] WARNING: Corrupted parsed data detected for current! Metadata: ${gedcomData.metadata.totalIndividuals} individuals, but map has ${gedcomData.individuals.size} entries`)
          console.log('[GEDCOM GET] Attempting to re-parse from original GEDCOM file...')
          const reparsed = await tryReparseFromOriginal('current', uploadDir)
          if (reparsed) {
            gedcomData = reparsed
            console.log(`[GEDCOM GET] SUCCESS: Re-parsed, got ${gedcomData.individuals.size} individuals and ${gedcomData.families.size} families`)
          } else {
            console.log('[GEDCOM GET] ERROR: Failed to re-parse from original file - original GEDCOM file may not exist')
            // Even though data is corrupted, return it so the UI at least shows the metadata
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
          console.log(`[GEDCOM GET] WARNING: Corrupted parsed data detected for ${fileId}! Metadata: ${gedcomData.metadata.totalIndividuals} individuals, but map has ${gedcomData.individuals.size} entries`)
          console.log(`[GEDCOM GET] Attempting to re-parse from original GEDCOM file for ${fileId}...`)
          const reparsed = await tryReparseFromOriginal(fileId, uploadDir)
          if (reparsed) {
            gedcomData = reparsed
            console.log(`[GEDCOM GET] SUCCESS: Re-parsed ${fileId}, got ${gedcomData.individuals.size} individuals and ${gedcomData.families.size} families`)
          } else {
            console.log(`[GEDCOM GET] ERROR: Failed to re-parse ${fileId} from original file - original GEDCOM file may not exist`)
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
          console.log(`[GEDCOM GET] WARNING: Corrupted parsed data detected for latest file ${latestFile.id}! Metadata: ${gedcomData.metadata.totalIndividuals} individuals, but map has ${gedcomData.individuals.size} entries`)
          console.log(`[GEDCOM GET] Attempting to re-parse from original GEDCOM file for ${latestFile.id}...`)
          const reparsed = await tryReparseFromOriginal(latestFile.id, uploadDir)
          if (reparsed) {
            gedcomData = reparsed
            console.log(`[GEDCOM GET] SUCCESS: Re-parsed latest file, got ${gedcomData.individuals.size} individuals and ${gedcomData.families.size} families`)
          } else {
            console.log(`[GEDCOM GET] ERROR: Failed to re-parse latest file ${latestFile.id} from original file - original GEDCOM file may not exist`)
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
    
    console.log(`[GEDCOM GET] Returning ${admin ? 'full' : 'anonymized'} data with ${gedcomData?.metadata.totalIndividuals || 0} individuals`)
    return {
      success: true,
      message: 'GEDCOM data loaded successfully',
      data: {
        // Maps would be lost in JSON (become {}), send them as entry arrays.
        // Visitors who are not logged in get an anonymized copy (names → initials, dates → year, no places)
        file: serializeGedcomFile(admin ? gedcomData : anonymizeGedcomFile(gedcomData)),
        fileInfo,
        anonymized: !admin,
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
