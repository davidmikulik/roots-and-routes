// GEDCOM Delete API Endpoint - delete GEDCOM data from server
import { deleteFile } from '~~/server/utils/storage'
import { getUploadDir } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{ fileId: string }>(event)
    
    if (!body.fileId) {
      throw createError({ statusCode: 400, statusMessage: 'fileId is required' })
    }
    
    // Delete both the original file and the parsed data
    const parsedPath = `${getUploadDir()}/parsed/${body.fileId}.json`
    const originalPath = `${getUploadDir()}/${body.fileId}.ged`
    
    await deleteFile(parsedPath)
    await deleteFile(originalPath)
    
    return {
      success: true,
      message: 'GEDCOM data deleted successfully',
      data: {
        fileId: body.fileId
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    console.error('Failed to delete GEDCOM data:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.statusMessage || 'Failed to delete GEDCOM data',
      message: error.message || 'Failed to delete GEDCOM data',
    })
  }
})
