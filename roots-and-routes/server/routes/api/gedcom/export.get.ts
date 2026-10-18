// GEDCOM Export API Endpoint
import { writeGedcom } from '~~/utils/gedcom/parser'
import { birthNameOf, marriedNameOf } from '~~/utils/gedcom/names'
import { loadParsedGedcom } from '~~/server/utils/storage'
import type { GedcomFile } from '~~/types'
import { requireAdminToken } from '~~/server/utils/adminAuth'

// Full data: administrator only, like the import
export default defineEventHandler(async (event) => {
  requireAdminToken(event)
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  try {
    const query = getQuery(event)
    const fileId = query.fileId as string
    const userId = query.userId as string | undefined
    const format = query.format as 'gedcom' | 'json' | 'csv' || 'gedcom'
    let gedcomFile: GedcomFile | null = null
    if (fileId) {
      gedcomFile = await loadParsedGedcom(fileId, userId)
      if (!gedcomFile) throw createError({ statusCode: 404, statusMessage: 'File not found' })
    } else {
      gedcomFile = {
        version: '5.5', encoding: 'UTF-8', source: 'Roots & Routes', date: new Date(),
        individuals: new Map(), families: new Map(), sources: new Map(), repositories: new Map(),
        multimedia: new Map(), notes: new Map(),
        metadata: { totalIndividuals: 0, totalFamilies: 0, totalSources: 0, totalRepositories: 0, totalMultimedia: 0, totalNotes: 0, totalGenerations: 0 },
      }
    }
    switch (format) {
      case 'gedcom':
        const exportFile: GedcomFile = {
          ...gedcomFile,
          individuals: new Map(gedcomFile.individuals),
          families: new Map(gedcomFile.families),
          sources: new Map(gedcomFile.sources),
          repositories: new Map(gedcomFile.repositories),
          multimedia: new Map(gedcomFile.multimedia),
          notes: new Map(gedcomFile.notes),
        }
        const gedcomContent = writeGedcom(exportFile, { version: '5.5', encoding: 'UTF-8' })
        return { success: true, message: 'GEDCOM export completed', data: { format: 'gedcom', content: gedcomContent, size: gedcomContent.length, filename: `export_${Date.now()}.ged` }, timestamp: new Date().toISOString() }
      case 'json':
        const jsonData = { version: gedcomFile.version, encoding: gedcomFile.encoding, source: gedcomFile.source, date: gedcomFile.date.toISOString(), metadata: gedcomFile.metadata, individuals: Array.from(gedcomFile.individuals.values()), families: Array.from(gedcomFile.families.values()), sources: Array.from(gedcomFile.sources.values()), repositories: Array.from(gedcomFile.repositories.values()), multimedia: Array.from(gedcomFile.multimedia.values()), notes: Array.from(gedcomFile.notes.values()) }
        return { success: true, message: 'JSON export completed', data: { format: 'json', content: jsonData, size: JSON.stringify(jsonData).length }, timestamp: new Date().toISOString() }
      case 'csv':
        const csvLines: string[] = ['ID,Full Name,Surname,Given Name,Married Name,Sex,Birth Date,Birth Place,Death Date,Death Place']
        for (const individual of gedcomFile.individuals.values()) {
          const name = birthNameOf(individual.names) || { given: '', surname: '', full: '' }
          const married = marriedNameOf(individual.names)?.full || ''
          const birth = individual.events.find(e => e.type === 'BIRT')
          const death = individual.events.find(e => e.type === 'DEAT')
          csvLines.push([individual.xrefId, `"${name.full.replace(/"/g, '""')}"`, `"${name.surname.replace(/"/g, '""')}"`, `"${name.given.replace(/"/g, '""')}"`, `"${married.replace(/"/g, '""')}"`, individual.sex, birth?.date?.raw ? `"${birth.date.raw.replace(/"/g, '""')}"` : '', birth?.place ? `"${birth.place.replace(/"/g, '""')}"` : '', death?.date?.raw ? `"${death.date.raw.replace(/"/g, '""')}"` : '', death?.place ? `"${death.place.replace(/"/g, '""')}"` : ''].join(','))
        }
        const csvContent = csvLines.join('\n')
        return { success: true, message: 'CSV export completed', data: { format: 'csv', content: csvContent, size: csvContent.length }, timestamp: new Date().toISOString() }
      default:
        throw createError({ statusCode: 400, statusMessage: 'Invalid format' })
    }
  } catch (error: any) {
    console.error('GEDCOM export error:', error)
    throw createError({ statusCode: error.statusCode || 500, statusMessage: error.statusMessage || 'Internal Server Error', message: error.message || 'Failed to export GEDCOM file', fatal: error.fatal })
  }
})
