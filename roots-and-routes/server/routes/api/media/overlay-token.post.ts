// Issues a short-lived token so the browser can upload a scanned map sheet straight to the Blob store. Scans are
// tens of MB and a Vercel function body is limited to ~4.5 MB, so they cannot go through /api/media/upload.
// The upload is for a bought copy the administrator provides; the app never downloads anything from an archive.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { tokenMatchesAdmin } from '~~/server/utils/adminAuth'
import { requireBlobToken } from '~~/server/utils/storage'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 80 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const body = await readBody<HandleUploadBody>(event)
  const result = await handleUpload({
    body,
    request: toWebRequest(event),
    token: requireBlobToken(),
    // The browser sends the admin token as clientPayload; Vercel's completion callback does not reach this branch
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      if (!tokenMatchesAdmin(clientPayload || '')) throw createError({ statusCode: 401, statusMessage: 'Administrator authentication required' })
      if (!/^uploads\/gedcom\/media\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(pathname)) {
        throw createError({ statusCode: 400, statusMessage: 'Unexpected upload path' })
      }
      return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, tokenPayload: null }
    },
    onUploadCompleted: async () => { /* the client saves the overlay via PUT /api/admin/locations */ },
  })
  return result
})
