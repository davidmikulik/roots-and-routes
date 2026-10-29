// Downloads one backup of the database of the request as GEDCOM text (Settings → Data and backups → Download).
// Its attachments come one by one from /api/admin/backups/<id>/media/<name>; the browser puts them into a ZIP.
import { requireDatabase } from '~~/server/utils/access'
import { readBackup } from '~~/server/utils/backups'

export default defineEventHandler(async (event) => {
  // The same permission as the list of backups
  const { db } = await requireDatabase(event, 'edit')
  const id = getRouterParam(event, 'id') || ''
  const content = await readBackup(db, id)
  setResponseHeaders(event, {
    'content-type': 'text/plain; charset=utf-8',
    'content-disposition': `attachment; filename="backup-${id}.ged"`,
    'cache-control': 'private, no-store',
  })
  return content
})
