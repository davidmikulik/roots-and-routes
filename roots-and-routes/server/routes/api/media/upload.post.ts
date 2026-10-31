// Stores an image or document pasted from the clipboard into the database of the request (level "edit"). The body is the file itself,
// its type comes in Content-Type and the original file name (for the extension) in ?name=
import { databasePaths, requireEditOrProposer } from '~~/server/utils/access'
import { requireBlobToken } from '~~/server/utils/storage'
import { storeUploadedMedia } from '~~/server/utils/media'

export default defineEventHandler(async (event) => {
  // Also a proposer's access key: images for the sources of a batch waiting for approval
  const { db } = await requireEditOrProposer(event)
  const body = await readRawBody(event, false)
  const name = String(getQuery(event).name || '')
  const stored = await storeUploadedMedia(body ? Buffer.from(body) : Buffer.alloc(0), getHeader(event, 'content-type') || '', name, databasePaths(db).prefix, requireBlobToken())
  console.log(`[MEDIA] Stored pasted ${stored.kind} ${stored.file} (${stored.size} B)`)
  return { success: true, data: stored }
})
