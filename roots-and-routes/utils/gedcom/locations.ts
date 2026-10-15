import type { GedcomEvent, GedcomFile, GedcomIndividual } from '~~/types/gedcom'
import type { KnownLocation } from '~~/types/locations'

export function normalizeLocationName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function getUniqueGedcomLocations(file: GedcomFile): string[] {
  const locations = new Map<string, string>()
  const add = (event?: GedcomEvent) => {
    const name = event?.place?.trim().replace(/\s+/g, ' ')
    const key = name ? normalizeLocationName(name) : ''
    if (name && key && !locations.has(key)) locations.set(key, name)
  }

  for (const individual of file.individuals.values()) {
    addIndividualLocations(individual, add)
  }
  for (const family of file.families.values()) {
    add(family.marriage)
    add(family.divorce)
    for (const event of family.engagements || []) add(event)
  }

  return [...locations.values()].sort((first, second) => first.localeCompare(second))
}

export function applyKnownLocations(file: GedcomFile, knownLocations: KnownLocation[], overwriteCoordinates = false): KnownLocation[] {
  const lookup = new Map(knownLocations.map(location => [normalizeLocationName(location.name), location]))
  const matched = new Map<string, KnownLocation>()
  const apply = (event?: GedcomEvent) => {
    if (!event?.place) return
    const key = normalizeLocationName(event.place)
    const location = lookup.get(key)
    if (!location || location.latitude === null || location.longitude === null) return
    if (overwriteCoordinates || !event.coordinates) event.coordinates = [location.latitude, location.longitude]
    matched.set(key, location)
  }

  for (const individual of file.individuals.values()) {
    applyIndividualLocations(individual, apply)
  }
  for (const family of file.families.values()) {
    apply(family.marriage)
    apply(family.divorce)
    for (const event of family.engagements || []) apply(event)
  }

  return [...matched.values()]
}

function addIndividualLocations(individual: GedcomIndividual, add: (event?: GedcomEvent) => void): void {
  add(individual.birth)
  add(individual.baptism)
  add(individual.christening)
  add(individual.death)
  add(individual.burial)
  add(individual.cremation)
  for (const event of individual.events) add(event)
}

function applyIndividualLocations(individual: GedcomIndividual, apply: (event?: GedcomEvent) => void): void {
  apply(individual.birth)
  apply(individual.baptism)
  apply(individual.christening)
  apply(individual.death)
  apply(individual.burial)
  apply(individual.cremation)
  for (const event of individual.events) apply(event)
}

const sameCoordinates = (first: [number, number], second: [number, number]): boolean =>
  Math.abs(first[0] - second[0]) < 1e-6 && Math.abs(first[1] - second[1]) < 1e-6

// Coordinates the tree has for each place (the first event with coordinates wins)
export function getPlaceCoordinates(file: GedcomFile): Map<string, { name: string; coordinates?: [number, number] }> {
  const places = new Map<string, { name: string; coordinates?: [number, number] }>()
  const add = (event?: GedcomEvent) => {
    const name = event?.place?.trim().replace(/\s+/g, ' ')
    const key = name ? normalizeLocationName(name) : ''
    if (!name || !key) return
    const coordinates = event!.coordinates ? [event!.coordinates[0], event!.coordinates[1]] as [number, number] : undefined
    const known = places.get(key)
    if (!known) places.set(key, { name, coordinates })
    else if (!known.coordinates && coordinates) known.coordinates = coordinates
  }
  for (const individual of file.individuals.values()) addIndividualLocations(individual, add)
  for (const family of file.families.values()) {
    add(family.marriage)
    add(family.divorce)
    for (const event of family.engagements || []) add(event)
  }
  return places
}

// Import: places of the file that the catalog does not know are added, with the file's coordinates when it has them;
// catalog entries still without coordinates take them from the file. Existing coordinates in the catalog are kept.
export function learnKnownLocations(catalog: KnownLocation[], file: GedcomFile): { catalog: KnownLocation[]; added: number; updated: number } {
  const lookup = new Map(catalog.map(location => [normalizeLocationName(location.name), { ...location }]))
  let added = 0
  let updated = 0
  for (const [key, place] of getPlaceCoordinates(file)) {
    const entry = lookup.get(key)
    if (!entry) {
      lookup.set(key, { name: place.name, latitude: place.coordinates?.[0] ?? null, longitude: place.coordinates?.[1] ?? null })
      added++
    } else if ((entry.latitude === null || entry.longitude === null) && place.coordinates) {
      entry.latitude = place.coordinates[0]
      entry.longitude = place.coordinates[1]
      updated++
    }
  }
  return { catalog: [...lookup.values()], added, updated }
}

export interface PersonLocationSync {
  catalog: KnownLocation[]
  // Catalog entries added or given new coordinates (the catalog must be saved when there are any)
  added: number
  updated: number
  // Events of the edited person that got coordinates from the catalog
  filled: number
  // Other events in the tree that took over coordinates changed in this edit
  propagated: number
}

// After a person was edited. For every place of the person's events (`events`, including the marriage):
// - no coordinates entered: they come from the catalog;
// - a place the catalog does not know: it is added (with the coordinates when entered);
// - coordinates entered that differ from the catalog and were not there before this edit (`before`: "place|lat,lng"
//   of the person's events before the edit): the catalog takes them and so does every other event with that place.
// Coordinates that were already there before the edit and differ from the catalog are left alone.
export function syncPersonLocations(file: GedcomFile, events: (GedcomEvent | undefined)[], catalog: KnownLocation[], before: Set<string>): PersonLocationSync {
  const lookup = new Map(catalog.map(location => [normalizeLocationName(location.name), { ...location }]))
  // Coordinates changed in this edit overwrite other events of the place; coordinates the place gets for the first
  // time only fill events that have none
  const changed = new Set<string>()
  const firstKnown = new Set<string>()
  let added = 0
  let updated = 0
  let filled = 0
  for (const event of events) {
    const name = event?.place?.trim().replace(/\s+/g, ' ')
    const key = name ? normalizeLocationName(name) : ''
    if (!event || !name || !key) continue
    const entry = lookup.get(key)
    const entryCoordinates = entry && entry.latitude !== null && entry.longitude !== null ? [entry.latitude, entry.longitude] as [number, number] : undefined
    if (!event.coordinates) {
      if (entryCoordinates) {
        event.coordinates = entryCoordinates
        filled++
      } else if (!entry) {
        lookup.set(key, { name, latitude: null, longitude: null })
        added++
      }
      continue
    }
    const coordinates: [number, number] = [event.coordinates[0], event.coordinates[1]]
    if (!entry) {
      lookup.set(key, { name, latitude: coordinates[0], longitude: coordinates[1] })
      firstKnown.add(key)
      added++
    } else if (!entryCoordinates || (!sameCoordinates(entryCoordinates, coordinates) && !before.has(locationStamp(name, coordinates)))) {
      entry.latitude = coordinates[0]
      entry.longitude = coordinates[1]
      ;(entryCoordinates ? changed : firstKnown).add(key)
      updated++
    }
  }
  const nextCatalog = [...lookup.values()]
  let propagated = 0
  if (changed.size || firstKnown.size) {
    const update = (event?: GedcomEvent) => {
      const key = event?.place ? normalizeLocationName(event.place) : ''
      if (!event || !(changed.has(key) || (firstKnown.has(key) && !event.coordinates))) return
      const location = lookup.get(key)!
      const coordinates: [number, number] = [location.latitude!, location.longitude!]
      if (event.coordinates && sameCoordinates(event.coordinates as [number, number], coordinates)) return
      event.coordinates = coordinates
      propagated++
    }
    for (const individual of file.individuals.values()) applyIndividualLocations(individual, update)
    for (const family of file.families.values()) {
      update(family.marriage)
      update(family.divorce)
      for (const event of family.engagements || []) update(event)
    }
  }
  return { catalog: nextCatalog, added, updated, filled, propagated }
}

// "place|lat,lng" of an event, to tell coordinates entered in an edit from those that were there before
export const locationStamp = (place: string, coordinates?: readonly unknown[]): string =>
  `${normalizeLocationName(place)}|${coordinates ? `${Number(coordinates[0]).toFixed(6)},${Number(coordinates[1]).toFixed(6)}` : ''}`
