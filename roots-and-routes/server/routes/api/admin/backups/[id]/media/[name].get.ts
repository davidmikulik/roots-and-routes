// One attachment of a backup (backups/<id>/media/<name>), for downloading the backup with its attachments
import { requireDatabase } from '~~/server/utils/access'
import { backupMediaDir } from '~~/server/utils/backups'
import { isMediaName, readMedia } from '~~/server/utils/media'
import { requireBlobToken } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'edit')
  const dir = backupMediaDir(db, getRouterParam(event, 'id') || '')
  const name = getRouterParam(event, 'name') || ''
  if (!isMediaName(name)) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const media = await readMedia(dir, name, requireBlobToken())
  setResponseHeaders(event, {
    'content-type': media.contentType,
    'content-disposition': `attachment; filename="${name}"`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
  })
  return sendStream(event, media.stream)
})
