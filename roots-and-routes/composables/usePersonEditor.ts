// The person editor shared by the pages (Tree, Graphical tree), see docs/graficky-strom-editace.md: edit a person,
// add a new one, or add a relative of a person with the relation filled in. The page passes its store instance:
// components must not call useGedcomStore() (every call re-fetches the tree on mount).
// The dialog is app/components/PersonEditor.vue, the actions app/components/PersonActions.vue (buttons) and PersonActionsMenu.vue (right-click menu).
import type { GedcomEvent, GedcomFile, GedcomIndividual } from '~~/types/gedcom'
import { linkDraftOf, linksOf, type FactSources, type IndividualDraft, type LinkDraft, type useGedcomStore } from '~~/composables/useGedcomStore'
import { useT } from '~~/composables/useT'
import { useAnonymize } from '~~/composables/useAnonymize'
import { birthNameOf, formatPersonName, marriedNameOf, nameSortKey, namePartsOf } from '~~/utils/gedcom/names'

export type Relation = 'father' | 'mother' | 'partner' | 'child' | 'sibling'
export const RELATIONS: Relation[] = ['father', 'mother', 'partner', 'child', 'sibling']

type Store = ReturnType<typeof useGedcomStore>

export function createEmptyDraft(): IndividualDraft {
  return {
    givenName: '', surname: '', marriedSurname: '', sex: '', livingStatus: 'living', birthDate: '', birthPlace: '', birthLatitude: '', birthLongitude: '',
    deathDate: '', deathPlace: '', deathCause: '', deathLatitude: '', deathLongitude: '',
    notes: '', fatherId: '', motherId: '', spouseId: '',
    marriageDate: '', marriagePlace: '', marriageLatitude: '', marriageLongitude: '', events: [], links: [],
    sources: emptySources(),
  }
}

export const emptySources = (): FactSources => ({ name: [], marriedName: [], sex: [], birth: [], death: [], marriage: [] })

// A new link of the editor (its key lets the facts name it as their source before it is saved)
export const newLinkDraft = (): LinkDraft => ({ key: `new-${crypto.randomUUID()}`, url: '', title: '' })

// Dates are edited as GEDCOM text ("1850", "ABT MAR 1850"), so a year or a month alone stays as precise as it was
const dateText = (event?: GedcomEvent): string => event?.date?.raw?.trim() || ''
const coordinate = (event: GedcomEvent | undefined, index: 0 | 1): string => event?.coordinates?.[index]?.toString() || ''

// The editor's draft of an existing person (first parents' family, first partner)
export function draftFromPerson(file: GedcomFile, individual: GedcomIndividual): IndividualDraft {
  const parentFamily = individual.familiesAsChild.map(id => file.families.get(id)).find(Boolean)
  const partnerFamily = individual.familiesAsSpouse.map(id => file.families.get(id)).find(Boolean)
  const firstPartner = partnerFamily ? (partnerFamily.husband === individual.xrefId ? partnerFamily.wife : partnerFamily.husband) : ''
  const birthName = birthNameOf(individual.names)
  const marriedName = marriedNameOf(individual.names)
  const sources: FactSources = {
    name: [...(birthName?.multimediaLinks || [])],
    marriedName: [...(marriedName?.multimediaLinks || [])],
    sex: [...(individual.sexLinks || [])],
    birth: [...(individual.birth?.multimediaLinks || [])],
    death: [...(individual.death?.multimediaLinks || [])],
    marriage: [...(partnerFamily?.marriage?.multimediaLinks || [])],
  }
  // A source can be a link the person does not list (e.g. the marriage record saved by the partner): it joins the
  // person's links in the editor, so it can be shown and chosen
  const links = linksOf(file, individual)
  const sourceIds = [...Object.values(sources).flat(), ...individual.events.flatMap(event => event.multimediaLinks || [])]
  for (const id of new Set(sourceIds)) {
    const link = links.some(existing => existing.id === id) ? null : linkDraftOf(file, id)
    if (link) links.push(link)
  }
  const known = new Set(links.map(link => link.key))
  const onlyKnown = (ids: string[]) => ids.filter(id => known.has(id))
  return {
    xrefId: individual.xrefId,
    givenName: namePartsOf(birthNameOf(individual.names)).given,
    surname: namePartsOf(birthNameOf(individual.names)).surname,
    marriedSurname: namePartsOf(marriedNameOf(individual.names)).surname,
    sex: individual.sex,
    livingStatus: individual.death ? 'deceased' : 'living',
    birthDate: dateText(individual.birth),
    birthPlace: individual.birth?.place || '',
    birthLatitude: coordinate(individual.birth, 0),
    birthLongitude: coordinate(individual.birth, 1),
    deathDate: dateText(individual.death),
    deathPlace: individual.death?.place || '',
    deathCause: individual.death?.cause || '',
    deathLatitude: coordinate(individual.death, 0),
    deathLongitude: coordinate(individual.death, 1),
    notes: individual.notes.join('\n'),
    fatherId: parentFamily?.husband || '',
    motherId: parentFamily?.wife || '',
    spouseId: firstPartner || '',
    marriageDate: dateText(partnerFamily?.marriage),
    marriagePlace: partnerFamily?.marriage?.place || '',
    marriageLatitude: coordinate(partnerFamily?.marriage, 0),
    marriageLongitude: coordinate(partnerFamily?.marriage, 1),
    events: individual.events.map(event => ({
      type: event.type, date: dateText(event), existingDate: event.date, place: event.place || '',
      latitude: coordinate(event, 0), longitude: coordinate(event, 1), description: event.description || '',
      existingCitations: event.sourceCitations, sources: onlyKnown(event.multimediaLinks || []),
    })),
    links,
    sources: Object.fromEntries(Object.entries(sources).map(([fact, ids]) => [fact, onlyKnown(ids)])) as unknown as FactSources,
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
  // The birth surname of a person (the family name a child gets from the father)
  const surnameOf = (id?: string) => (id ? namePartsOf(birthNameOf(file.individuals.get(id)?.names)).surname : '')
  switch (relation) {
    case 'father':
    case 'mother':
      draft.sex = relation === 'father' ? 'M' : 'F'
      draft.parentOf = anchor.xrefId
      // The father passes the family name to the child
      if (relation === 'father') draft.surname = surnameOf(anchor.xrefId)
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
      // The child's family name: the father's birth surname, otherwise the mother's current one
      draft.surname = surnameOf(draft.fatherId) || namePartsOf(marriedNameOf(file.individuals.get(draft.motherId)?.names)).surname || surnameOf(draft.motherId)
      break
    case 'sibling':
      draft.fatherId = parents?.husband || ''
      draft.motherId = parents?.wife || ''
      draft.surname = surnameOf(draft.fatherId) || surnameOf(anchor.xrefId)
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
    return person ? anon.personName(person) : id
  }
  // People for the parent and partner choices, sorted by family name and given name
  const people = computed(() => store.getAllAppPersons()
    .map((person) => {
      const name = formatPersonName(person.names, t('name.born')) || person.fullName
      return { id: person.id, label: person.lifespan ? `${name}, ${person.lifespan}` : name, key: nameSortKey(person.names) }
    })
    .sort((a, b) => a.key.localeCompare(b.key) || a.label.localeCompare(b.label)))

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

  // Saves the draft; returns the person's id, or null when it failed (the error was shown). The dialog closes itself
  // after telling the page (an unmounted component could not emit "saved" any more)
  const save = async (): Promise<string | null> => {
    if ((!draft.value.givenName.trim() && !draft.value.surname.trim()) || saving.value) return null
    saving.value = true
    try {
      const id = await store.savePerson({ ...draft.value, xrefId: editingId.value || undefined })
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
