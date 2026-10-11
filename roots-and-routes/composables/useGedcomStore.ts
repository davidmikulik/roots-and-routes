import { computed, onMounted } from 'vue'
import type { GedcomFile, GedcomParseResult, GedcomIndividual, GedcomEvent, GedcomDate, GedcomEventType, AppPerson, MapEvent, FamilyTree } from '~~/types/gedcom'
import type { KnownLocation } from '~~/types/locations'
import { parseGedcom, writeGedcom, convertToAppPerson, convertToFamilyTree, createMapEventsFromFile } from '~~/utils/gedcom/parser'
import { applyKnownLocations } from '~~/utils/gedcom/locations'

interface GedcomState {
  file: GedcomFile | null
  parseResult: GedcomParseResult | null
  fileId: string | null
  userId: string | null
  isLoading: boolean
  error: string | null
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
  fullName: string
  sex: 'M' | 'F' | ''
  birthDate: string
  birthPlace: string
  birthLatitude: string
  birthLongitude: string
  deathDate: string
  deathPlace: string
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
}

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

const createEmptyState = (): GedcomState => ({
  file: null,
  parseResult: null,
  fileId: null,
  userId: null,
  isLoading: false,
  error: null,
})

const normalizedName = (individual: GedcomIndividual): string => (individual.names[0]?.full || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

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

const createEvent = (type: GedcomEventType, date: string, place: string, latitude: string, longitude: string, description = '', existingDate?: GedcomDate): GedcomEvent | undefined => {
  const gedcomDate = toGedcomDate(date) || existingDate
  const lat = Number(latitude)
  const lng = Number(longitude)
  const hasCoordinates = latitude !== '' && longitude !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  return gedcomDate || place || hasCoordinates || description
    ? { type, date: gedcomDate, place: place || undefined, coordinates: hasCoordinates ? [lat, lng] : undefined, description: description || undefined }
    : undefined
}

export const useGedcomStore = () => {
  const state = useState<GedcomState>('gedcom-store', createEmptyState)
  const restored = useState<boolean>('gedcom-store-restored', () => false)

  if (import.meta.client && !restored.value) {
    restored.value = true
    onMounted(async () => {
      if (state.value.file) return
      try {
        const content = await loadContent()
        if (!content) return
        const result = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
        state.value = { ...createEmptyState(), file: result.file, parseResult: result }
      } catch (error) {
        console.error('Failed to restore GEDCOM data:', error)
      }
    })
  }

  // Computed properties
  const individuals = computed(() => state.value.file?.individuals || new Map())
  const families = computed(() => state.value.file?.families || new Map())
  const totalIndividuals = computed(() => state.value.file?.metadata.totalIndividuals || 0)
  const totalFamilies = computed(() => state.value.file?.metadata.totalFamilies || 0)
  const hasData = computed(() => state.value.file !== null)

  // Actions
  const setFile = (file: GedcomFile, parseResult: GedcomParseResult, fileId?: string, userId?: string) => {
    state.value = {
      file,
      parseResult,
      fileId: fileId || null,
      userId: userId || null,
      isLoading: false,
      error: null
    }
  }

  const refreshLocationCoordinates = async (knownLocations: KnownLocation[]): Promise<number> => {
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
    if (import.meta.client) await saveContent(writeGedcom(file))
    return matched.length
  }

  const parseFile = async (content: string, fileId?: string, userId?: string, knownLocations: KnownLocation[] = []): Promise<GedcomParseResult | null> => {
    state.value.isLoading = true
    state.value.error = null

    try {
      const result = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
      applyKnownLocations(result.file, knownLocations)
      setFile(result.file, result, fileId, userId)
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
          incomingName: incomingPerson.names[0]?.full || incomingPerson.xrefId,
          existingName: match.names[0]?.full || match.xrefId,
        })
      }
    }
    return duplicates
  }

  const mergeFile = async (incoming: GedcomFile, choices: Record<string, DuplicateChoice> = {}): Promise<void> => {
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
    if (import.meta.client) await saveContent(writeGedcom(merged))
  }

  const savePerson = async (draft: IndividualDraft): Promise<string> => {
    const file = state.value.file
    if (!file) throw new Error('Import a GEDCOM file before editing people')
    const xrefId = draft.xrefId || (() => {
      let number = 1
      while (file.individuals.has(`I${number}`)) number++
      return `I${number}`
    })()
    const existing = file.individuals.get(xrefId)
    const words = draft.fullName.trim().split(/\s+/)
    const surname = words.length > 1 ? words.pop()! : ''
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
      names: [{ full: draft.fullName.trim(), given: words.join(' '), surname }],
      sex: draft.sex,
      birth: createEvent('BIRT', draft.birthDate, draft.birthPlace, draft.birthLatitude, draft.birthLongitude, '', existing?.birth?.date),
      death: createEvent('DEAT', draft.deathDate, draft.deathPlace, draft.deathLatitude, draft.deathLongitude, '', existing?.death?.date),
      notes: draft.notes.split(/\r?\n/).map(note => note.trim()).filter(Boolean),
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

    file.metadata.totalIndividuals = file.individuals.size
    file.metadata.totalFamilies = file.families.size
    const stats = state.value.parseResult?.stats || { linesProcessed: 0, recordsCreated: 0, parsingTime: 0 }
    setFile(file, { file, warnings: [], errors: [], stats: { ...stats, recordsCreated: file.individuals.size + file.families.size } })
    if (import.meta.client) await saveContent(writeGedcom(file))
    return xrefId
  }

  const removePerson = async (xrefId: string): Promise<void> => {
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
    if (import.meta.client) await saveContent(writeGedcom(file))
  }

  const clear = () => {
    state.value = createEmptyState()
    if (import.meta.client) void deleteContent().catch(error => console.error('Failed to clear saved GEDCOM data:', error))
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

  const searchPeople = (query: string): AppPerson[] => {
    const allPeople = getAllAppPersons()
    if (!query) return allPeople
    
    const lowerQuery = query.toLowerCase()
    return allPeople.filter(person => 
      person.fullName.toLowerCase().includes(lowerQuery) ||
      (person.lifespan && person.lifespan.toLowerCase().includes(lowerQuery))
    )
  }

  return {
    // State
    state,
    individuals,
    families,
    totalIndividuals,
    totalFamilies,
    hasData,
    
    // Actions
    setFile,
    parseFile,
    refreshLocationCoordinates,
    findDuplicatePeople,
    mergeFile,
    savePerson,
    removePerson,
    clear,
    setError,
    setLoading,
    
    // Helpers
    getAllAppPersons,
    getFamilyTree,
    getMapEvents,
    getPersonById,
    searchPeople
  }
}
