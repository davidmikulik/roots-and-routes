import { ref, computed } from 'vue'
import type { GedcomFile, GedcomParseResult, AppPerson, MapEvent, FamilyTree } from '~/types/gedcom'
import { parseGedcom, convertToAppPerson, convertToFamilyTree, convertToMapEvent, createMapEventsFromFile } from '~/utils/gedcom/parser'

interface GedcomState {
  file: GedcomFile | null
  parseResult: GedcomParseResult | null
  fileId: string | null
  userId: string | null
  isLoading: boolean
  error: string | null
}

export const useGedcomStore = () => {
  const state = ref<GedcomState>({
    file: null,
    parseResult: null,
    fileId: null,
    userId: null,
    isLoading: false,
    error: null
  })

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

  const parseFile = async (content: string, fileId?: string, userId?: string): Promise<GedcomParseResult | null> => {
    state.value.isLoading = true
    state.value.error = null

    try {
      const result = parseGedcom(content, { resolveXrefs: true, extractCoordinates: true })
      setFile(result.file, result, fileId, userId)
      return result
    } catch (error: any) {
      state.value.error = error.message || 'Failed to parse GEDCOM file'
      state.value.isLoading = false
      return null
    }
  }

  const clear = () => {
    state.value = {
      file: null,
      parseResult: null,
      fileId: null,
      userId: null,
      isLoading: false,
      error: null
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
