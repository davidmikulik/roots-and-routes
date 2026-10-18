// The person editor shared by the pages (Tree, Graphical tree), see docs/graficky-strom-editace.md: edit a person,
// add a new one, or add a relative of a person with the relation filled in. The page passes its store instance:
// components must not call useGedcomStore() (every call re-fetches the tree on mount).
// The dialog is app/components/PersonEditor.vue, the buttons app/components/PersonRelationActions.vue.
import type { GedcomEvent, GedcomFile, GedcomIndividual } from '~~/types/gedcom'
import { linksOf, type IndividualDraft, type useGedcomStore } from '~~/composables/useGedcomStore'
import { useT } from '~~/composables/useT'
import { useAnonymize } from '~~/composables/useAnonymize'
import { displayName } from '~~/utils/gedcom/treeGraph'

export type Relation = 'father' | 'mother' | 'partner' | 'child' | 'sibling'
export const RELATIONS: Relation[] = ['father', 'mother', 'partner', 'child', 'sibling']

type Store = ReturnType<typeof useGedcomStore>

export function createEmptyDraft(): IndividualDraft {
  return {
    fullName: '', sex: '', birthDate: '', birthPlace: '', birthLatitude: '', birthLongitude: '',
    deathDate: '', deathPlace: '', deathLatitude: '', deathLongitude: '',
    notes: '', fatherId: '', motherId: '', spouseId: '',
    marriageDate: '', marriagePlace: '', marriageLatitude: '', marriageLongitude: '', events: [], links: [],
  }
}

const formatDateInput = (date?: Date | null): string => date && !Number.isNaN(date.getTime())
  ? date.toISOString().slice(0, 10)
  : ''
const coordinate = (event: GedcomEvent | undefined, index: 0 | 1): string => event?.coordinates?.[index]?.toString() || ''

// The editor's draft of an existing person (first parents' family, first partner)
export function draftFromPerson(file: GedcomFile, individual: GedcomIndividual): IndividualDraft {
  const parentFamily = individual.familiesAsChild.map(id => file.families.get(id)).find(Boolean)
  const partnerFamily = individual.familiesAsSpouse.map(id => file.families.get(id)).find(Boolean)
  const firstPartner = partnerFamily ? (partnerFamily.husband === individual.xrefId ? partnerFamily.wife : partnerFamily.husband) : ''
  return {
    xrefId: individual.xrefId,
    fullName: individual.names[0]?.full || '',
    sex: individual.sex,
    birthDate: formatDateInput(individual.birth?.date?.parsed),
    birthPlace: individual.birth?.place || '',
    birthLatitude: coordinate(individual.birth, 0),
    birthLongitude: coordinate(individual.birth, 1),
    deathDate: formatDateInput(individual.death?.date?.parsed),
    deathPlace: individual.death?.place || '',
    deathLatitude: coordinate(individual.death, 0),
    deathLongitude: coordinate(individual.death, 1),
    notes: individual.notes.join('\n'),
    fatherId: parentFamily?.husband || '',
    motherId: parentFamily?.wife || '',
    spouseId: firstPartner || '',
    marriageDate: formatDateInput(partnerFamily?.marriage?.date?.parsed),
    marriagePlace: partnerFamily?.marriage?.place || '',
    marriageLatitude: coordinate(partnerFamily?.marriage, 0),
    marriageLongitude: coordinate(partnerFamily?.marriage, 1),
    events: individual.events.map(event => ({
      type: event.type, date: formatDateInput(event.date?.parsed), existingDate: event.date, place: event.place || '',
      latitude: coordinate(event, 0), longitude: coordinate(event, 1), description: event.description || '',
    })),
    links: linksOf(file, individual),
  }
}

// Which relatives can be added to a person: a second father / mother cannot, a sibling needs a recorded parent
export function relationAvailability(file: GedcomFile, id: string): Record<Relation, boolean> {
  const person = file.individuals.get(id)
  const parents = person?.familiesAsChild.map(familyId => file.families.get(familyId)).find(Boolean)
  return {
    father: !!person && !parents?.husband,
    mother: !!person && !parents?.wife,
    partner: !!person,
    child: !!person,
    sibling: !!person && !!(parents?.husband || parents?.wife),
  }
}

// A new person's draft with the relation to `anchor` filled in; the admin can still change the fields
export function relationDraft(file: GedcomFile, anchor: GedcomIndividual, relation: Relation): IndividualDraft {
  const draft = createEmptyDraft()
  const parents = anchor.familiesAsChild.map(id => file.families.get(id)).find(Boolean)
  const ownFamily = anchor.familiesAsSpouse.map(id => file.families.get(id)).find(Boolean)
  switch (relation) {
    case 'father':
    case 'mother':
      draft.sex = relation === 'father' ? 'M' : 'F'
      draft.parentOf = anchor.xrefId
      // The other parent becomes the partner: the same family, and the marriage can be filled in right away
      draft.spouseId = (relation === 'father' ? parents?.wife : parents?.husband) || ''
      break
    case 'partner':
      draft.sex = anchor.sex === 'M' ? 'F' : anchor.sex === 'F' ? 'M' : ''
      draft.spouseId = anchor.xrefId
      break
    case 'child':
      if (ownFamily) {
        draft.fatherId = ownFamily.husband || ''
        draft.motherId = ownFamily.wife || ''
      } else if (anchor.sex === 'F') {
        draft.motherId = anchor.xrefId
      } else {
        draft.fatherId = anchor.xrefId
      }
      break
    case 'sibling':
      draft.fatherId = parents?.husband || ''
      draft.motherId = parents?.wife || ''
      break
  }
  return draft
}

export const usePersonEditor = (store: Store) => {
  const { t } = useT()
  const anon = useAnonymize()
  const isOpen = ref(false)
  const draft = ref<IndividualDraft>(createEmptyDraft())
  const editingId = ref<string | null>(null)
  // "Father of Jan Novák" for a new relative, empty otherwise
  const note = ref('')
  const saving = ref(false)

  const nameOf = (id: string): string => {
    const person = store.state.value.file?.individuals.get(id)
    return person ? anon.name(displayName(person)) : id
  }
  // People for the parent and partner choices, sorted by name
  const people = computed(() => store.getAllAppPersons()
    .map(person => ({ id: person.id, label: person.lifespan ? `${person.fullName} (${person.lifespan})` : person.fullName }))
    .sort((a, b) => a.label.localeCompare(b.label)))

  const availability = (id: string): Record<Relation, boolean> => {
    const file = store.state.value.file
    return file ? relationAvailability(file, id) : { father: false, mother: false, partner: false, child: false, sibling: false }
  }

  const openEdit = (id: string) => {
    const file = store.state.value.file
    const individual = file?.individuals.get(id)
    if (!file || !individual) return
    draft.value = draftFromPerson(file, individual)
    editingId.value = id
    note.value = ''
    isOpen.value = true
  }

  const openNew = (relation?: Relation, anchorId?: string) => {
    const file = store.state.value.file
    const anchor = anchorId ? file?.individuals.get(anchorId) : undefined
    draft.value = file && anchor && relation ? relationDraft(file, anchor, relation) : createEmptyDraft()
    editingId.value = null
    note.value = anchor && relation ? t(`tree.relation.note.${relation}`, { name: nameOf(anchor.xrefId) }) : ''
    isOpen.value = true
  }

  const close = () => { isOpen.value = false }

  const errorText = (error: any): string => error?.data?.statusMessage || error?.message || t('tree.unknownError')

  // Saves the draft; returns the person's id, or null when it failed (the error was shown)
  const save = async (): Promise<string | null> => {
    if (!draft.value.fullName.trim() || saving.value) return null
    saving.value = true
    try {
      const id = await store.savePerson({ ...draft.value, xrefId: editingId.value || undefined })
      isOpen.value = false
      // Changed coordinates were passed on to other people with the same place, or the catalog could not be updated
      const sync = store.lastLocationSync.value
      if (sync?.error) window.alert(t('tree.locations.syncFailed', { error: sync.error }))
      else if (sync?.propagated) window.alert(t('tree.locations.propagated', { n: sync.propagated }))
      return id
    } catch (error) {
      window.alert(t('tree.savingFailed', { error: errorText(error) }))
      return null
    } finally {
      saving.value = false
    }
  }

  // Links and attachments of the person (the editor's link rows)
  const media = {
    copy: (url: string) => store.copyLinkToTree(url),
    upload: (file: Blob, name: string) => store.uploadMediaToTree(file, name),
    open: (path: string) => store.openStoredMedia(path),
  }

  // Editing only for the administrator on the real data (the store refuses it otherwise anyway)
  const canEdit = computed(() => store.hasData.value && !store.state.value.anonymized)

  return { isOpen, draft, editingId, note, saving, people, canEdit, availability, nameOf, openEdit, openNew, close, save, errorText, media }
}

export type PersonEditor = ReturnType<typeof usePersonEditor>
