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
