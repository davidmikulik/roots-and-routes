// GEDCOM Delete API Endpoint - deletes the tree of the database of the request (level "admin"); the database itself,
// its backups and attachments stay
import { deleteFile } from '~~/server/utils/storage'
import { databasePaths, requireDatabase } from '~~/server/utils/access'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'admin')
  try {
    const paths = databasePaths(db)
    // Both the original file and the parsed data; one of them may be missing
    for (const path of [paths.parsed, paths.original]) {
      if (!await deleteFile(path)) console.warn(`Failed to delete ${path}`)
    }

    return {
      success: true,
      message: 'GEDCOM data deleted successfully',
      data: {
        fileId: 'current',
        databaseId: db.id,
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
