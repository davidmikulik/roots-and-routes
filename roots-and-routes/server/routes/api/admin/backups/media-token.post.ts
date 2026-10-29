// Short-lived tokens for uploading the attachments of a backup from the disk straight to the Blob store (a function
// accepts at most ~4.5 MB per request, attachments can be larger). The browser sends its session token, the database
// and the backup in clientPayload; only users who can edit that database may upload, and only into that backup's
// media folder. Vercel's completion callback does not reach this branch.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { actorFromToken, levelOn } from '~~/server/utils/access'
import { loadAccounts } from '~~/server/utils/accounts'
import { backupMediaDir } from '~~/server/utils/backups'
import { MEDIA_CONTENT_TYPES } from '~~/server/utils/media'
import { requireBlobToken } from '~~/server/utils/storage'
import { levelAtLeast } from '~~/utils/accessLevels'

const MAX_BYTES = 50 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const body = await readBody<HandleUploadBody>(event)
  return await handleUpload({
    body,
    request: toWebRequest(event),
    token: requireBlobToken(),
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      let payload: { token?: unknown; database?: unknown; backupId?: unknown } = {}
      try { payload = JSON.parse(clientPayload || '{}') } catch { /* checked below */ }
      const accounts = await loadAccounts()
      const actor = await actorFromToken(typeof payload.token === 'string' ? payload.token : '', accounts)
      const db = accounts.databases.find(candidate => candidate.id === payload.database)
      if (!actor || !db || !levelAtLeast(levelOn(accounts, actor, db), 'edit')) throw createError({ statusCode: 403, statusMessage: 'Permission denied' })
      const dir = backupMediaDir(db, typeof payload.backupId === 'string' ? payload.backupId : '')
      if (!pathname.startsWith(`${dir}/`) || !/^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(pathname.slice(dir.length + 1))) {
        throw createError({ statusCode: 400, statusMessage: 'Unexpected upload path' })
      }
      return { allowedContentTypes: MEDIA_CONTENT_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, allowOverwrite: true, tokenPayload: null }
    },
    onUploadCompleted: async () => { /* nothing to record: the backup lists its attachments by their paths */ },
  })
})
