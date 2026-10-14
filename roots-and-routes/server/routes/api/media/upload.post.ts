// Stores an image or document pasted from the clipboard (administrator only). The body is the file itself,
// its type comes in Content-Type and the original file name (for the extension) in ?name=
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { requireBlobToken } from '~~/server/utils/storage'
import { storeUploadedMedia } from '~~/server/utils/media'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const body = await readRawBody(event, false)
  const name = String(getQuery(event).name || '')
  const stored = await storeUploadedMedia(body ? Buffer.from(body) : Buffer.alloc(0), getHeader(event, 'content-type') || '', name, requireBlobToken())
  console.log(`[MEDIA] Stored pasted ${stored.kind} ${stored.file} (${stored.size} B)`)
  return { success: true, data: stored }
})
