// A copied image or document of the database of the request (full data: level "read"), or with ?scope=layers a
// sheet of the shared map layers (uploads/gedcom/media, any logged-in user with full data)
import { databasePaths, requireActor, requireDatabase } from '~~/server/utils/access'
import { getUploadDir, requireBlobToken } from '~~/server/utils/storage'
import { isMediaName, readMedia } from '~~/server/utils/media'

export default defineEventHandler(async (event) => {
  const layers = getQuery(event).scope === 'layers'
  const dir = layers
    ? (await requireActor(event, 'read'), `${getUploadDir()}/media`)
    : databasePaths((await requireDatabase(event, 'read')).db).media
  const name = getRouterParam(event, 'name') || ''
  if (!isMediaName(name)) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const media = await readMedia(dir, name, requireBlobToken())
  setResponseHeaders(event, {
    'content-type': media.contentType,
    'content-disposition': `${media.inline ? 'inline' : 'attachment'}; filename="${name}"`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
  })
  return sendStream(event, media.stream)
})
