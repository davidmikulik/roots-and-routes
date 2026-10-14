// A copied image or document; administrator only, like the full data of the tree
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { requireBlobToken } from '~~/server/utils/storage'
import { isMediaName, readMedia } from '~~/server/utils/media'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const name = getRouterParam(event, 'name') || ''
  if (!isMediaName(name)) throw createError({ statusCode: 404, statusMessage: 'File not found' })
  const media = await readMedia(name, requireBlobToken())
  setResponseHeaders(event, {
    'content-type': media.contentType,
    'content-disposition': `${media.inline ? 'inline' : 'attachment'}; filename="${name}"`,
    'x-content-type-options': 'nosniff',
    'cache-control': 'private, no-store',
  })
  return sendStream(event, media.stream)
})
