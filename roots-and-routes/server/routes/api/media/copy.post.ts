// Downloads a linked image or document and stores a copy in the tree (administrator only)
import { requireAdminToken } from '~~/server/utils/adminAuth'
import { requireBlobToken } from '~~/server/utils/storage'
import { copyRemoteMedia } from '~~/server/utils/media'

export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  const body = await readBody<{ url?: unknown }>(event)
  if (typeof body?.url !== 'string' || !body.url.trim()) throw createError({ statusCode: 400, statusMessage: 'url is required' })
  const copied = await copyRemoteMedia(body.url.trim(), requireBlobToken())
  console.log(`[MEDIA] Copied ${copied.kind} ${copied.file} (${copied.size} B)`)
  return { success: true, data: copied }
})
