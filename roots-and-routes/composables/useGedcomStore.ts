import { computed, effectScope, onMounted, watch } from 'vue'
import type { GedcomFile, GedcomParseResult, GedcomIndividual, GedcomEvent, GedcomName, GedcomDate, GedcomEventType, AppPerson, MapEvent, FamilyTree } from '~~/types/gedcom'
import type { KnownLocation } from '~~/types/locations'
import { parseGedcom, writeGedcom, convertToAppPerson, convertToFamilyTree, createMapEventsFromFile } from '~~/utils/gedcom/parser'
import { applyCatalogToTree, applyKnownLocations, learnKnownLocations, locationStamp, syncPersonLocations } from '~~/utils/gedcom/locations'
import { birthNameOf, formatPersonName, isMarriedName, joinNameParts, marriedNameOf, nameMatches, namePartsOf, normalizeText } from '~~/utils/gedcom/names'
import { serializeGedcomFile, deserializeGedcomFile, type SerializedGedcomFile } from '~~/utils/gedcom/serialize'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { useSettings } from '~~/composables/useSettings'
import { useT } from '~~/composables/useT'

interface GedcomState {
  file: GedcomFile | null
  parseResult: GedcomParseResult | null
  fileId: string | null
  userId: string | null
  isLoading: boolean
  error: string | null
  // Edits that were not sent to the server yet (only when auto-save is off)
  dirty: boolean
  // The server sent the anonymized copy for visitors (not logged in): it must never be edited, saved or exported
  anonymized: boolean
}

export interface GedcomDuplicate {
  incomingXref: string
  existingXref: string
  incomingName: string
  existingName: string
}

export type DuplicateChoice = 'existing' | 'incoming' | 'combine'

export interface IndividualEventDraft {
  type: GedcomEventType
  date: string
  existingDate?: GedcomDate
  place: string
  latitude: string
  longitude: string
  description: string
}

export interface IndividualDraft {
  xrefId?: string
  // Birth name split into the given name and the (birth) surname; the surname after marriage (empty = none) makes a
  // second name with TYPE married and the same given name, see utils/gedcom/names.ts
  givenName: string
  surname: string
  marriedSurname: string
  sex: 'M' | 'F' | ''
  birthDate: string
  birthPlace: string
  birthLatitude: string
  birthLongitude: string
  deathDate: string
  deathPlace: string
  // GEDCOM "2 CAUS" under DEAT
  deathCause: string
  deathLatitude: string
  deathLongitude: string
  notes: string
  fatherId: string
  motherId: string
  spouseId: string
  marriageDate: string
  marriagePlace: string
  marriageLatitude: string
  marriageLongitude: string
  events: IndividualEventDraft[]
  links: LinkDraft[]
  // A new parent: the id of the child this person becomes the father / mother of (usePersonEditor, relation father/mother)
  parentOf?: string
}

// A link of a person (a GEDCOM OBJE record). `file` is set when the image or document was copied into the tree
// (media/<name>, served by /api/media/<name>); `url` is then the original address.
export interface LinkDraft {
  id?: string
  url: string
  title: string
  file?: string
  format?: string
  // The address the copy was downloaded from; changing the address then drops the copy. A file pasted from the
  // clipboard has none and stays when an address is typed in afterwards.
  copiedFrom?: string
}

export interface CopiedMedia {
  file: string
  format: string
  kind: 'image' | 'document'
  contentType: string
  size: number
}

// Same limit as server/utils/media.ts (Vercel functions accept at most 4.5 MB per request)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

// Re-encodes an image as JPEG, scaling it down until it fits under the upload limit
const shrinkImage = async (file: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(file)
  let scale = Math.min(1, 4000 / Math.max(bitmap.width, bitmap.height))
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (jpeg && jpeg.size <= MAX_UPLOAD_BYTES) return jpeg
    scale *= 0.75
  }
  return file
}

export const isStoredMedia =(file?: string): file is string => !!file && file.startsWith('media/')

// The links of a person for the editor and the detail
export const linksOf = (file: GedcomFile, individual: GedcomIndividual): LinkDraft[] => individual.multimediaLinks
  .map(id => file.multimedia.get(id))
  .filter((media): media is NonNullable<typeof media> => !!media && !!media.file)
  .map(media => isStoredMedia(media.file)
    ? { id: media.xrefId, url: media.url || '', title: media.title || '', file: media.file, format: media.format, copiedFrom: media.url }
    : { id: media.xrefId, url: media.file!, title: media.title || '' })

const DATABASE_NAME = 'roots-and-routes'
const STORE_NAME = 'gedcom'
const DATA_KEY = 'current'

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const saveContent = async (content: string): Promise<void> => {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(content, DATA_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

const loadContent = async (): Promise<string | null> => {
  const database = await openDatabase()
  const content = await new Promise<string | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DATA_KEY)
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return content
}

const deleteContent = async (): Promise<void> => {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(DATA_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

const loadFromServer = async (headers: Record<string, string>, fileId?: string): Promise<{ file: GedcomFile; parseResult: GedcomParseResult; fileId: string; anonymized: boolean } | null> => {
  if (!import.meta.client) return null
  try {
    const url = fileId ? `/api/gedcom/get?fileId=${fileId}` : '/api/gedcom/get'
    console.log(`[GEDCOM] Fetching from server: ${url}`)
    const response = await $fetch<{
      success: boolean
      data: {
        file: SerializedGedcomFile
        fileInfo: { id: string; name: string; createdAt?: Date }
        anonymized?: boolean
      }
    }>(url, { headers })
    
    console.log('[GEDCOM] Server response:', { success: response.success, hasFile: !!response.data?.file })
    
    if (!response.success || !response.data?.file) {
      return null
    }
    
    // Server sends Maps as entry arrays, restore them
    const file = deserializeGedcomFile(response.data.file)
    const parseResult: GedcomParseResult = {
      file,
      warnings: [],
      errors: [],
      stats: {
        linesProcessed: 0,
        recordsCreated: file.individuals.size + file.families.size,
        parsingTime: 0
      }
    }
    
    return { file, parseResult, fileId: response.data.fileInfo.id, anonymized: !!response.data.anonymized }
  } catch (error) {
    console.error('[GEDCOM] Failed to load GEDCOM from server:', error)
    return null
  }
}

const createEmptyState = (): GedcomState => ({
  file: null,
  parseResult: null,
  fileId: null,
  userId: null,
  isLoading: false,
  error: null,
  dirty: false,
  anonymized: false,
})

// Duplicates are matched by the birth name (the married name may be missing in the other file)
// Given name and surname are compared separately, so "Jan /Novák/" and "Jan Novák" without slashes match
const normalizedName = (individual: GedcomIndividual): string => {
  const { given, surname } = namePartsOf(birthNameOf(individual.names))
  return `${normalizeText(given)}|${normalizeText(surname)}`.replace(/[^a-z0-9| ]+/g, ' ').trim()
}

const birthYear = (individual: GedcomIndividual): number | null => {
  const date = individual.birth?.date
  const parsedYear = date?.parsed?.getFullYear() || date?.year
  if (parsedYear) return parsedYear
  return date?.raw?.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0] ? Number(date.raw.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)![0]) : null
}

const union = <T>(first: T[] = [], second: T[] = []): T[] => {
  const values = new Map<string, T>()
  for (const value of [...first, ...second]) values.set(JSON.stringify(value), value)
  return [...values.values()]
}

const toGedcomDate = (value: string): GedcomDate | undefined => {
  if (!value) return undefined
  const parsed = new Date(`${value}T00:00:00Z`)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return {
    raw: `${parsed.getUTCDate()} ${months[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`,
    parsed,
    day: parsed.getUTCDate(),
    month: parsed.getUTCMonth(),
    year: parsed.getUTCFullYear(),
  }
}

const createEvent = (type: GedcomEventType, date: string, place: string, latitude: string, longitude: string, description = '', existingDate?: GedcomDate, cause = ''): GedcomEvent | undefined => {
  const gedcomDate = toGedcomDate(date) || existingDate
  const lat = Number(latitude)
  const lng = Number(longitude)
  const hasCoordinates = latitude !== '' && longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  return gedcomDate || place || hasCoordinates || description || cause.trim()
    ? { type, date: gedcomDate, place: place || undefined, coordinates: hasCoordinates ? [lat, lng] : undefined, description: description || undefined, cause: cause.trim() || undefined }
    : undefined
}

// Events of a person including those of their partnerships (marriage, divorce, engagements)
const personEvents = (file: GedcomFile, person: GedcomIndividual): (GedcomEvent | undefined)[] => [
  person.birth, person.baptism, person.christening, person.death, person.burial, person.cremation, ...person.events,
  ...person.familiesAsSpouse.map(id => file.families.get(id)).flatMap(family => [family?.marriage, family?.divorce, ...(family?.engagements || [])]),
]

export interface LocationSyncResult { added: number; updated: number; filled: number; propagated: number; error: string }

// Shared by every useGedcomStore() call
let latestRequest = 0
let authWatcher: ReturnType<typeof effectScope> | null = null

export const useGedcomStore = () => {
  const state = useState<GedcomState>('gedcom-store', createEmptyState)
  // What the last person edit did with the known locations (shown after saving)
  const lastLocationSync = useState<LocationSyncResult | null>('gedcom-location-sync', () => null)
  const adminAuth = useAdminAuth()
  const appSettings = useSettings()
  const { t } = useT()

  // Every change, save and export: only the administrator, and never on the anonymized copy for visitors
  // (saving it would overwrite the real tree with initials and years)
  const requireEditable = () => {
    adminAuth.requireAdmin()
    if (state.value.anonymized) throw new Error(t('admin.dataAnonymized'))
  }

  // Persist the current file to the server; needs the admin token and throws on failure
  const saveToServer = async (file: GedcomFile): Promise<void> => {
    requireEditable()
    if (!state.value.fileId) return
    await $fetch('/api/gedcom/save', {
      method: 'POST',
      headers: adminAuth.authHeaders(),
      body: { fileId: state.value.fileId, fileData: serializeGedcomFile(file) },
    })
    state.value.dirty = false
  }

  // After an edit: send it to the server right away, or only remember it when auto-save is off
  const persist = async (file: GedcomFile): Promise<void> => {
    if (appSettings.settings.value.data.autoSave) await saveToServer(file)
    else state.value.dirty = true
  }

  // Manual save for when auto-save is off
  const saveNow = async (): Promise<void> => {
    requireEditable()
    if (state.value.file) await saveToServer(state.value.file)
  }

  // Loads the tree from the server: full data with the admin token, the anonymized copy without it.
  // Only the newest request may write the state (a slow anonymous answer must not replace a newer full one).
  const refreshFromServer = async (): Promise<boolean> => {
    // The saved token is normally restored in app.vue's onMounted, which runs after the pages' onMounted
    adminAuth.restore()
    const request = ++latestRequest
    try {
      console.log('[GEDCOM] Loading from server...')
      const serverData = await loadFromServer(adminAuth.authHeaders())
      if (request !== latestRequest) return !!serverData
      if (serverData) {
        console.log(`[GEDCOM] Loaded ${serverData.file.metadata.totalIndividuals} individuals from server${serverData.anonymized ? ' (anonymized)' : ''}`)
        state.value = { ...createEmptyState(), file: serverData.file, parseResult: serverData.parseResult, fileId: serverData.fileId, anonymized: serverData.anonymized }
        return true
      } else {
        console.log('[GEDCOM] No data found on server')
      }
    } catch (error) {
      console.error('[GEDCOM] Failed to load from server:', error)
    }
    return false
  }

  if (import.meta.client) {
    console.log('[GEDCOM] Initializing store...')
    onMounted(async () => {
      console.log('[GEDCOM] onMounted triggered, current hasData:', state.value.file !== null)
      // Never replace edits that were not saved to the server yet
      if (state.value.dirty) return
      // Always try to load from server first on each page load
      // This ensures all devices see the same (latest) data
      const loadedFromServer = await refreshFromServer()
      console.log('[GEDCOM] Loaded from server:', loadedFromServer)
      
      // Fallback to local IndexedDB if server has no data
      if (!loadedFromServer) {
        console.log('[GEDCOM] Trying local IndexedDB...')
        try {
          const content = await loadContent()
          if (!content) {
            console.log('[GEDCOM] No local data found')
            return
          }
          const result = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
          state.value = { ...createEmptyState(), file: result.file, parseResult: result }
          console.log(`[GEDCOM] Loaded ${result.file.metadata.totalIndividuals} individuals from IndexedDB`)
        } catch (fallbackError) {
          console.error('[GEDCOM] Failed to restore from local storage:', fallbackError)
        }
      }
    })
  }

  // Logging in must bring the full data and logging out must drop it. One watcher for the whole app, outside any
  // component scope (it would stop when the page that created it unmounts). Unsaved edits are kept.
  if (import.meta.client && !authWatcher) {
    authWatcher = effectScope(true)
    authWatcher.run(() => watch(adminAuth.isAdmin, (isAdmin) => {
      if (state.value.dirty || !state.value.file) return
      if (isAdmin === state.value.anonymized) void refreshFromServer()
    }))
  }

  // Computed properties
  const individuals = computed(() => state.value.file?.individuals || new Map())
  const families = computed(() => state.value.file?.families || new Map())
  const totalIndividuals = computed(() => state.value.file?.metadata.totalIndividuals || 0)
  const totalFamilies = computed(() => state.value.file?.metadata.totalFamilies || 0)
  const hasData = computed(() => state.value.file !== null)

  // Actions
  const setFile = (file: GedcomFile, parseResult: GedcomParseResult, fileId?: string, userId?: string) => {
    // Edits call setFile without ids: keep the current ones, otherwise the file could never be saved to the server
    state.value = {
      file,
      parseResult,
      fileId: fileId || state.value.fileId,
      userId: userId || state.value.userId,
      isLoading: false,
      error: null,
      dirty: state.value.dirty,
      anonymized: state.value.anonymized,
    }
  }

  // Two-way sync of the known locations and the tree (button on Admin → Known locations):
  // tree → catalog: places the catalog lacks are added, entries without coordinates take them from the tree;
  // catalog → tree: events get the catalog's coordinates (the catalog wins where they differ).
  // Saves the catalog and, when something changed, the tree; returns the new catalog and the counts.
  const syncKnownLocations = async (catalog: KnownLocation[]) => {
    requireEditable()
    const file = state.value.file
    if (!file) throw new Error(t('admin.noTree'))
    const learned = learnKnownLocations(catalog, file)
    const tree = applyCatalogToTree(file, learned.catalog)
    await $fetch('/api/admin/locations', { method: 'PUT', headers: adminAuth.authHeaders(), body: { locations: learned.catalog } })
    if (tree.filled || tree.overwritten) {
      const previousResult = state.value.parseResult
      setFile(file, {
        file,
        warnings: previousResult?.warnings || [],
        errors: previousResult?.errors || [],
        stats: previousResult?.stats || { linesProcessed: 0, recordsCreated: file.individuals.size + file.families.size, parsingTime: 0 },
      })
      if (import.meta.client) {
        await saveContent(writeGedcom(file))
        await persist(file)
      }
    }
    return { catalog: learned.catalog, added: learned.added, updated: learned.updated, ...tree }
  }

  const refreshLocationCoordinates = async (knownLocations: KnownLocation[]): Promise<number> => {
    requireEditable()
    const file = state.value.file
    if (!file) return 0
    const matched = applyKnownLocations(file, knownLocations, true)
    const previousResult = state.value.parseResult
    setFile(file, {
      file,
      warnings: previousResult?.warnings || [],
      errors: previousResult?.errors || [],
      stats: previousResult?.stats || { linesProcessed: 0, recordsCreated: file.individuals.size + file.families.size, parsingTime: 0 },
    }, state.value.fileId || undefined, state.value.userId || undefined)
    if (import.meta.client) {
      await saveContent(writeGedcom(file))
      await persist(file)
    }
    return matched.length
  }

  const parseFile = async (content: string, fileId?: string, userId?: string, knownLocations: KnownLocation[] = []): Promise<GedcomParseResult | null> => {
    state.value.isLoading = true
    state.value.error = null

    try {
      const result = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
      applyKnownLocations(result.file, knownLocations)
      setFile(result.file, result, fileId, userId)
      // The import endpoint already stored this file on the server
      state.value.dirty = false
      state.value.anonymized = false
      if (import.meta.client) {
        try {
          await saveContent(writeGedcom(result.file))
        } catch (error) {
          console.error('GEDCOM imported but could not be saved locally:', error)
          state.value.error = 'Import succeeded, but local browser storage could not save a backup.'
        }
      }
      return result
    } catch (error: any) {
      state.value.error = error.message || 'Failed to parse GEDCOM file'
      state.value.isLoading = false
      return null
    }
  }

  const findDuplicatePeople = (incoming: GedcomFile): GedcomDuplicate[] => {
    if (!state.value.file) return []
    const existingPeople = [...state.value.file.individuals.values()]
    const duplicates: GedcomDuplicate[] = []
    for (const incomingPerson of incoming.individuals.values()) {
      const name = normalizedName(incomingPerson)
      const year = birthYear(incomingPerson)
      const match = existingPeople.find(existingPerson => {
        if (existingPerson.xrefId === incomingPerson.xrefId) return true
        if (!name || normalizedName(existingPerson) !== name) return false
        const existingYear = birthYear(existingPerson)
        return year !== null && existingYear !== null && year === existingYear
      })
      if (match) {
        duplicates.push({
          incomingXref: incomingPerson.xrefId,
          existingXref: match.xrefId,
          incomingName: formatPersonName(incomingPerson.names) || incomingPerson.xrefId,
          existingName: formatPersonName(match.names) || match.xrefId,
        })
      }
    }
    return duplicates
  }

  const mergeFile = async (incoming: GedcomFile, choices: Record<string, DuplicateChoice> = {}): Promise<void> => {
    requireEditable()
    const { backupOnImport, backupCount } = appSettings.settings.value.data
    // Back up the server's tree before it is replaced by the merged one; a failed backup stops the merge
    if (import.meta.client && backupOnImport) {
      await $fetch('/api/admin/backups', { method: 'POST', headers: adminAuth.authHeaders(), body: { keep: backupCount } })
    }
    const current = state.value.file
    if (!current) {
      const result: GedcomParseResult = {
        file: incoming,
        warnings: [],
        errors: [],
        stats: { linesProcessed: 0, recordsCreated: incoming.individuals.size + incoming.families.size, parsingTime: 0 },
      }
      setFile(incoming, result)
      if (import.meta.client) await saveContent(writeGedcom(incoming))
      return
    }

    const merged: GedcomFile = {
      ...current,
      individuals: new Map(current.individuals),
      families: new Map(current.families),
      sources: new Map(current.sources),
      repositories: new Map(current.repositories),
      multimedia: new Map(current.multimedia),
      notes: new Map(current.notes),
      metadata: { ...current.metadata },
    }
    const duplicates = new Map(findDuplicatePeople(incoming).map(duplicate => [duplicate.incomingXref, duplicate.existingXref]))
    const individualIds = new Map<string, string>()
    let nextIndividualId = 1
    const allocateId = (prefix: string, used: Map<string, unknown>) => {
      let id = `${prefix}${nextIndividualId++}`
      while (used.has(id)) id = `${prefix}${nextIndividualId++}`
      return id
    }

    for (const person of incoming.individuals.values()) {
      const duplicateId = duplicates.get(person.xrefId)
      if (duplicateId) {
        individualIds.set(person.xrefId, duplicateId)
      } else {
        const id = merged.individuals.has(person.xrefId) ? allocateId('I', merged.individuals) : person.xrefId
        individualIds.set(person.xrefId, id)
      }
    }

    const familyIds = new Map<string, string>()
    for (const family of incoming.families.values()) {
      const id = merged.families.has(family.xrefId) ? allocateId('F', merged.families) : family.xrefId
      familyIds.set(family.xrefId, id)
    }

    for (const person of incoming.individuals.values()) {
      const id = individualIds.get(person.xrefId)!
      const incomingPerson: GedcomIndividual = {
        ...person,
        xrefId: id,
        familiesAsChild: person.familiesAsChild.map(familyId => familyIds.get(familyId) || familyId),
        familiesAsSpouse: person.familiesAsSpouse.map(familyId => familyIds.get(familyId) || familyId),
      }
      const existingPerson = merged.individuals.get(id)
      if (!existingPerson) {
        merged.individuals.set(id, incomingPerson)
        continue
      }

      const choice = choices[person.xrefId] || 'combine'
      const preferred = choice === 'incoming' ? incomingPerson : existingPerson
      const other = preferred === incomingPerson ? existingPerson : incomingPerson
      merged.individuals.set(id, {
        ...other,
        ...preferred,
        xrefId: id,
        names: choice === 'combine' ? union(existingPerson.names, incomingPerson.names) : preferred.names,
        sex: preferred.sex || other.sex,
        birth: preferred.birth || other.birth,
        baptism: preferred.baptism || other.baptism,
        christening: preferred.christening || other.christening,
        death: preferred.death || other.death,
        burial: preferred.burial || other.burial,
        cremation: preferred.cremation || other.cremation,
        events: choice === 'combine' ? union(existingPerson.events, incomingPerson.events) : preferred.events,
        familiesAsChild: union(existingPerson.familiesAsChild, incomingPerson.familiesAsChild),
        familiesAsSpouse: union(existingPerson.familiesAsSpouse, incomingPerson.familiesAsSpouse),
        associations: union(existingPerson.associations, incomingPerson.associations),
        multimediaLinks: union(existingPerson.multimediaLinks, incomingPerson.multimediaLinks),
        notes: union(existingPerson.notes, incomingPerson.notes),
        sourceCitations: union(existingPerson.sourceCitations, incomingPerson.sourceCitations),
        attributes: { ...existingPerson.attributes, ...incomingPerson.attributes },
        userData: { ...existingPerson.userData, ...incomingPerson.userData },
      })
    }

    for (const family of incoming.families.values()) {
      const id = familyIds.get(family.xrefId)!
      merged.families.set(id, {
        ...family,
        xrefId: id,
        husband: family.husband ? individualIds.get(family.husband) || family.husband : undefined,
        wife: family.wife ? individualIds.get(family.wife) || family.wife : undefined,
        children: family.children.map(childId => individualIds.get(childId) || childId),
      })
    }

    merged.sources = new Map([...merged.sources, ...incoming.sources])
    merged.repositories = new Map([...merged.repositories, ...incoming.repositories])
    merged.multimedia = new Map([...merged.multimedia, ...incoming.multimedia])
    merged.notes = new Map([...merged.notes, ...incoming.notes])
    merged.metadata = {
      ...merged.metadata,
      ...incoming.metadata,
      totalIndividuals: merged.individuals.size,
      totalFamilies: merged.families.size,
      totalSources: merged.sources.size,
      totalRepositories: merged.repositories.size,
      totalMultimedia: merged.multimedia.size,
      totalNotes: merged.notes.size,
    }
    const stats = state.value.parseResult?.stats || { linesProcessed: 0, recordsCreated: 0, parsingTime: 0 }
    setFile(merged, {
      file: merged,
      warnings: [],
      errors: [],
      stats: { ...stats, recordsCreated: merged.individuals.size + merged.families.size },
    })
    if (import.meta.client) {
      await saveContent(writeGedcom(merged))
      await persist(merged)
    }
  }

  // Writes the links of the editor as OBJE records. A record the person no longer links to is removed when nobody else
  // uses it. Every link needs an address and a description.
  const saveLinks = (file: GedcomFile, ownerId: string, previous: string[], links: LinkDraft[]): string[] => {
    const ids: string[] = []
    for (const link of links) {
      const url = link.url.trim()
      const title = link.title.trim()
      // A file pasted from the clipboard needs no address
      if (!title || (!url && !isStoredMedia(link.file))) throw new Error(t('tree.links.required'))
      const id = link.id && file.multimedia.has(link.id) ? link.id : (() => {
        let number = 1
        while (file.multimedia.has(`M${number}`)) number++
        return `M${number}`
      })()
      file.multimedia.set(id, {
        notes: [],
        userData: {},
        ...file.multimedia.get(id),
        xrefId: id,
        title,
        ...(isStoredMedia(link.file)
          ? { file: link.file, url: url || undefined, format: link.format }
          : { file: url, url: undefined, format: 'url' }),
      })
      ids.push(id)
    }
    const others = [...[...file.individuals.values()].filter(person => person.xrefId !== ownerId), ...file.families.values()]
    const usedElsewhere = new Set(others.flatMap(owner => owner.multimediaLinks || []))
    for (const id of previous) if (!ids.includes(id) && !usedElsewhere.has(id)) file.multimedia.delete(id)
    file.metadata.totalMultimedia = file.multimedia.size
    return ids
  }

  // After a person was edited: the catalog of known locations (/api/admin/locations) and the tree are synced, see
  // syncPersonLocations. A failure does not stop saving the person; it is logged and kept in lastLocationSync.
  const syncLocationsAfterEdit = async (file: GedcomFile, events: (GedcomEvent | undefined)[], before: Set<string>): Promise<void> => {
    try {
      const { locations } = await $fetch<{ locations: KnownLocation[] }>('/api/admin/locations', { headers: adminAuth.authHeaders() })
      const result = syncPersonLocations(file, events, locations, before)
      if (result.added || result.updated) {
        await $fetch('/api/admin/locations', { method: 'PUT', headers: adminAuth.authHeaders(), body: { locations: result.catalog } })
      }
      console.log(`[GEDCOM] Known locations: ${result.added} added, ${result.updated} updated, ${result.filled} filled, ${result.propagated} other events updated`)
      lastLocationSync.value = { added: result.added, updated: result.updated, filled: result.filled, propagated: result.propagated, error: '' }
    } catch (error: any) {
      console.error('[GEDCOM] Known locations could not be synced:', error)
      lastLocationSync.value = { added: 0, updated: 0, filled: 0, propagated: 0, error: error?.data?.statusMessage || error?.message || 'error' }
    }
  }

  const savePerson = async (draft: IndividualDraft): Promise<string> => {
    requireEditable()
    const file = state.value.file
    if (!file) throw new Error('Import a GEDCOM file before editing people')
    const xrefId = draft.xrefId || (() => {
      let number = 1
      while (file.individuals.has(`I${number}`)) number++
      return `I${number}`
    })()
    const existing = file.individuals.get(xrefId)
    // Places and coordinates of the person before the edit, to tell coordinates entered now from those already there
    const locationsBefore = new Set(existing ? personEvents(file, existing).filter(event => event?.place).map(event => locationStamp(event!.place!, event!.coordinates)) : [])
    // Names from the given name and surnames of the editor. An unchanged name keeps its record as it is (suffix,
    // prefix, type…). The birth name gets TYPE birth next to a married name; other names (aka, immigrant…) are kept.
    const oldBirth = existing ? birthNameOf(existing.names) : undefined
    const oldMarried = existing ? marriedNameOf(existing.names) : undefined
    const clean = (text: string) => text.trim().replace(/\s+/g, ' ')
    const givenName = clean(draft.givenName)
    const surname = clean(draft.surname)
    const marriedSurname = clean(draft.marriedSurname)
    if (!givenName && !surname) throw new Error(t('tree.field.nameRequired'))
    const buildName = (given: string, last: string, old?: GedcomName): GedcomName => {
      const parts = namePartsOf(old)
      if (old && parts.given === given && parts.surname === last) return { ...old, given, surname: last }
      // A prefix or suffix ("ml.") of the old name stays with the new parts
      return {
        ...(old ? { prefix: old.prefix, suffix: old.suffix, nickname: old.nickname, type: old.type } : {}),
        given,
        surname: last,
        full: joinNameParts({ prefix: old?.prefix, given, surname: last, suffix: old?.suffix }),
      }
    }
    const married: GedcomName | undefined = marriedSurname ? { ...buildName(givenName, marriedSurname, oldMarried), type: 'married' } : undefined
    const birth = buildName(givenName, surname, oldBirth)
    if (married && !birth.type) birth.type = 'birth'
    const otherNames = (existing?.names || []).filter(name => name !== oldBirth && name !== oldMarried && !isMarriedName(name))
    const names = [birth, ...(married ? [married] : []), ...otherNames]
    const individual: GedcomIndividual = {
      ...(existing || {
        xrefId,
        names: [],
        sex: '',
        events: [],
        familiesAsChild: [],
        familiesAsSpouse: [],
        associations: [],
        multimediaLinks: [],
        notes: [],
        sourceCitations: [],
        attributes: {},
        userData: {},
      }),
      xrefId,
      names,
      sex: draft.sex,
      birth: createEvent('BIRT', draft.birthDate, draft.birthPlace, draft.birthLatitude, draft.birthLongitude, '', existing?.birth?.date),
      death: createEvent('DEAT', draft.deathDate, draft.deathPlace, draft.deathLatitude, draft.deathLongitude, '', existing?.death?.date, draft.deathCause || ''),
      notes: draft.notes.split(/\r?\n/).map(note => note.trim()).filter(Boolean),
      multimediaLinks: saveLinks(file, xrefId, existing?.multimediaLinks || [], draft.links),
      events: draft.events.map(event => createEvent(event.type, event.date, event.place, event.latitude, event.longitude, event.description, event.existingDate)).filter((event): event is GedcomEvent => Boolean(event)),
    }
    file.individuals.set(xrefId, individual)

    for (const familyId of individual.familiesAsChild) {
      const family = file.families.get(familyId)
      if (family) family.children = family.children.filter(childId => childId !== xrefId)
    }
    individual.familiesAsChild = []
    if (draft.fatherId || draft.motherId) {
      let family = [...file.families.values()].find(candidate =>
        candidate.husband === (draft.fatherId || undefined) && candidate.wife === (draft.motherId || undefined),
      )
      if (!family) {
        let number = 1
        while (file.families.has(`F${number}`)) number++
        family = {
          xrefId: `F${number}`,
          husband: draft.fatherId || undefined,
          wife: draft.motherId || undefined,
          children: [],
          notes: [],
          sourceCitations: [],
          multimediaLinks: [],
          userData: {},
        }
        file.families.set(family.xrefId, family)
      }
      if (!family.children.includes(xrefId)) family.children.push(xrefId)
      individual.familiesAsChild.push(family.xrefId)
      for (const parentId of [family.husband, family.wife]) {
        const parent = parentId ? file.individuals.get(parentId) : undefined
        if (parent && !parent.familiesAsSpouse.includes(family.xrefId)) parent.familiesAsSpouse.push(family.xrefId)
      }
    }

    // A new parent of an existing person: takes the free place in the child's family (by sex), or a new family.
    // Before the partner below, so that the other parent as partner finds this family and no duplicate is made.
    if (draft.parentOf && draft.parentOf !== xrefId) {
      const child = file.individuals.get(draft.parentOf)
      if (!child) throw new Error(t('tree.relation.missingChild'))
      let family = child.familiesAsChild.map(id => file.families.get(id)).find(Boolean)
      const slot: 'husband' | 'wife' | null = individual.sex === 'M' ? 'husband' : individual.sex === 'F' ? 'wife'
        : !family?.husband ? 'husband' : !family?.wife ? 'wife' : null
      if (family && (!slot || (family[slot] && family[slot] !== xrefId))) throw new Error(t('tree.relation.parentTaken'))
      if (!family) {
        let number = 1
        while (file.families.has(`F${number}`)) number++
        family = { xrefId: `F${number}`, children: [child.xrefId], notes: [], sourceCitations: [], multimediaLinks: [], userData: {} }
        file.families.set(family.xrefId, family)
        child.familiesAsChild.push(family.xrefId)
      }
      family[slot!] = xrefId
      if (!individual.familiesAsSpouse.includes(family.xrefId)) individual.familiesAsSpouse.push(family.xrefId)
    }

    if (draft.spouseId && draft.spouseId !== xrefId) {
      const isMale = individual.sex === 'M'
      const husbandId = isMale ? xrefId : draft.spouseId
      const wifeId = isMale ? draft.spouseId : xrefId
      let family = [...file.families.values()].find(candidate => candidate.husband === husbandId && candidate.wife === wifeId)
      if (!family) {
        let number = 1
        while (file.families.has(`F${number}`)) number++
        family = {
          xrefId: `F${number}`,
          husband: husbandId,
          wife: wifeId,
          children: [],
          notes: [],
          sourceCitations: [],
          multimediaLinks: [],
          userData: {},
        }
        file.families.set(family.xrefId, family)
      }
      family.marriage = createEvent('MARR', draft.marriageDate, draft.marriagePlace, draft.marriageLatitude, draft.marriageLongitude, '', family.marriage?.date)
      for (const personId of [xrefId, draft.spouseId]) {
        const person = file.individuals.get(personId)
        if (person && !person.familiesAsSpouse.includes(family.xrefId)) person.familiesAsSpouse.push(family.xrefId)
      }
    }

    // Known locations: fill coordinates from the catalog, add new places, pass changed coordinates on
    if (import.meta.client) await syncLocationsAfterEdit(file, personEvents(file, individual), locationsBefore)

    file.metadata.totalIndividuals = file.individuals.size
    file.metadata.totalFamilies = file.families.size
    const stats = state.value.parseResult?.stats || { linesProcessed: 0, recordsCreated: 0, parsingTime: 0 }
    setFile(file, { file, warnings: [], errors: [], stats: { ...stats, recordsCreated: file.individuals.size + file.families.size } })
    if (import.meta.client) {
      await saveContent(writeGedcom(file))
      await persist(file)
    }
    return xrefId
  }

  const removePerson = async (xrefId: string): Promise<void> => {
    requireEditable()
    const file = state.value.file
    if (!file) return
    file.individuals.delete(xrefId)
    for (const [familyId, family] of file.families) {
      if (family.husband === xrefId) family.husband = undefined
      if (family.wife === xrefId) family.wife = undefined
      family.children = family.children.filter(childId => childId !== xrefId)
      if (!family.husband && !family.wife && family.children.length === 0) file.families.delete(familyId)
    }
    for (const person of file.individuals.values()) {
      person.familiesAsChild = person.familiesAsChild.filter(familyId => file.families.has(familyId))
      person.familiesAsSpouse = person.familiesAsSpouse.filter(familyId => file.families.has(familyId))
    }
    file.metadata.totalIndividuals = file.individuals.size
    file.metadata.totalFamilies = file.families.size
    const stats = state.value.parseResult?.stats || { linesProcessed: 0, recordsCreated: 0, parsingTime: 0 }
    setFile(file, { file, warnings: [], errors: [], stats: { ...stats, recordsCreated: file.individuals.size + file.families.size } })
    if (import.meta.client) {
      await saveContent(writeGedcom(file))
      await persist(file)
    }
  }

  const clear = async () => {
    const fileId = state.value.fileId
    state.value = createEmptyState()
    if (import.meta.client) {
      void deleteContent().catch(error => console.error('Failed to clear saved GEDCOM data:', error))
      // Deleting server data is an admin action; without the token only the local copy is cleared
      if (fileId && adminAuth.isAdmin.value) {
        try {
          await $fetch('/api/gedcom/delete', {
            method: 'POST',
            headers: adminAuth.authHeaders(),
            body: { fileId }
          })
        } catch (error) {
          console.error('Failed to delete from server:', error)
        }
      }
    }
  }

  const setError = (error: string) => {
    state.value.error = error
    state.value.isLoading = false
  }

  const setLoading = (isLoading: boolean) => {
    state.value.isLoading = isLoading
  }

  // Helper functions for components
  const getAllAppPersons = (): AppPerson[] => {
    if (!state.value.file) return []
    
    const persons: AppPerson[] = []
    for (const [xrefId, individual] of state.value.file.individuals) {
      const person = convertToAppPerson(individual, state.value.file, 0)
      persons.push(person)
    }
    return persons
  }

  const getFamilyTree = (rootXrefId?: string): FamilyTree | null => {
    if (!state.value.file) return null
    return convertToFamilyTree(state.value.file, rootXrefId)
  }

  const getMapEvents = (): MapEvent[] => {
    if (!state.value.file) return []
    return createMapEventsFromFile(state.value.file)
  }

  const getPersonById = (id: string): AppPerson | null => {
    const tree = getFamilyTree()
    if (!tree) return null
    return tree.people.get(id) || null
  }

  // Downloads the whole tree, including edits not saved to the server yet; admin only, like the import.
  // Without attachments a plain .ged file; with attachments a ZIP in the GEDZIP layout (GEDCOM 7): gedcom.ged plus
  // media/<name>, which is where FILE media/<name> points. Returns the attachments that could not be downloaded.
  const downloadGedcom = async (): Promise<{ attachments: number; missing: string[] }> => {
    requireEditable()
    const file = state.value.file
    if (!file || !import.meta.client) return { attachments: 0, missing: [] }
    const date = new Date().toISOString().slice(0, 10)
    const text = writeGedcom(file)
    const media = [...new Set([...file.multimedia.values()].map(item => item.file).filter(isStoredMedia))]
    const missing: string[] = []
    let blob: Blob
    if (media.length) {
      const { zipSync, strToU8 } = await import('fflate')
      const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { 'gedcom.ged': strToU8(text) }
      for (const path of media) {
        try {
          const content = await $fetch<Blob>(`/api/${path}`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
          // Images and PDFs are compressed already
          entries[path] = [new Uint8Array(await content.arrayBuffer()), { level: 0 }]
        } catch (error) {
          console.error(`[GEDCOM] Attachment ${path} could not be exported:`, error)
          missing.push(path)
        }
      }
      blob = new Blob([zipSync(entries) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
    } else {
      blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `roots-and-routes-${date}.${media.length ? 'zip' : 'ged'}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return { attachments: media.length - missing.length, missing }
  }

  // "Zkopírovat": the server downloads the image or document behind the link and stores a copy in the tree
  const copyLinkToTree = async (url: string): Promise<CopiedMedia> => {
    requireEditable()
    const response = await $fetch<{ data: CopiedMedia }>('/api/media/copy', { method: 'POST', headers: adminAuth.authHeaders(), body: { url } })
    return response.data
  }

  // A file pasted from the clipboard. Vercel accepts at most 4.5 MB per request: a bigger image is re-encoded as JPEG
  // (smaller if needed), a bigger document is refused.
  const uploadMediaToTree = async (file: Blob, name: string): Promise<CopiedMedia> => {
    requireEditable()
    const body = file.size > MAX_UPLOAD_BYTES && file.type.startsWith('image/') ? await shrinkImage(file) : file
    if (body.size > MAX_UPLOAD_BYTES) throw new Error(t('tree.links.tooLarge'))
    const fileName = body === file ? name : name.replace(/\.[^.]+$/, '') + '.jpg'
    const response = await $fetch<{ data: CopiedMedia }>(`/api/media/upload?name=${encodeURIComponent(fileName)}`, {
      method: 'POST',
      headers: { ...adminAuth.authHeaders(), 'content-type': body.type || 'application/octet-stream' },
      body,
    })
    return response.data
  }

  // A stored attachment as a Blob (with its content type), for links in the person detail
  const fetchStoredMedia = async (path: string): Promise<Blob> => {
    adminAuth.requireAdmin()
    return await $fetch<Blob>(`/api/${path}`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
  }

  // Copies are private (admin token), so a plain link cannot open them: fetch with the token and open the result.
  // The window is opened before the request, otherwise the browser blocks it as a popup.
  const openStoredMedia = async (path: string): Promise<void> => {
    adminAuth.requireAdmin()
    const opensInBrowser = /\.(jpg|png|gif|webp|pdf|txt)$/.test(path)
    const target = opensInBrowser ? window.open('', '_blank') : null
    try {
      const blob = await $fetch<Blob>(`/api/${path}`, { headers: adminAuth.authHeaders(), responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      if (target) target.location.href = url
      else {
        const link = document.createElement('a')
        link.href = url
        link.download = path.split('/').pop() || 'document'
        link.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      target?.close()
      throw error
    }
  }

  const searchPeople = (query: string): AppPerson[] => {
    const allPeople = getAllAppPersons()
    if (!query) return allPeople
    
    // Given name, birth surname or surname after marriage, without diacritics (utils/gedcom/names.ts), or the years
    return allPeople.filter(person =>
      nameMatches(person.names, query) ||
      (person.lifespan && person.lifespan.toLowerCase().includes(query.toLowerCase()))
    )
  }

  return {
    // State
    state,
    lastLocationSync,
    individuals,
    families,
    totalIndividuals,
    totalFamilies,
    hasData,
    
    // Actions
    setFile,
    parseFile,
    refreshLocationCoordinates,
    syncKnownLocations,
    findDuplicatePeople,
    mergeFile,
    savePerson,
    removePerson,
    clear,
    setError,
    setLoading,
    refreshFromServer,
    saveNow,
    downloadGedcom,
    copyLinkToTree,
    uploadMediaToTree,
    openStoredMedia,
    fetchStoredMedia,
    
    // Helpers
    getAllAppPersons,
    getFamilyTree,
    getMapEvents,
    getPersonById,
    searchPeople
  }
}
