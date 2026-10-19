// Downloads a linked image or document and stores a copy in the tree of the database of the request (level "edit")
import { databasePaths, requireDatabase } from '~~/server/utils/access'
import { requireBlobToken } from '~~/server/utils/storage'
import { copyRemoteMedia } from '~~/server/utils/media'

export default defineEventHandler(async (event) => {
  const { db } = await requireDatabase(event, 'edit')
  const body = await readBody<{ url?: unknown }>(event)
  if (typeof body?.url !== 'string' || !body.url.trim()) throw createError({ statusCode: 400, statusMessage: 'url is required' })
  const copied = await copyRemoteMedia(body.url.trim(), databasePaths(db).prefix, requireBlobToken())
  console.log(`[MEDIA] Copied ${copied.kind} ${copied.file} (${copied.size} B)`)
  return { success: true, data: copied }
})
