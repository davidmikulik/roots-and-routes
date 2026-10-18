import type { GedcomName } from '~~/types/gedcom'

// GEDCOM writes a name as "Given /Surname/ suffix"; the slashes only mark the surname and are never shown.
// `GedcomName.full` holds the name for display (without slashes), `given` / `surname` / `suffix` the parts,
// and `nameToGedcom` puts the slashes back when the file is exported.

/** Removes the surname slashes and extra spaces: "Jan /Mikulik/" -> "Jan Mikulik" */
export const stripSurnameSlashes = (text: string): string => text.replace(/\//g, ' ').replace(/\s+/g, ' ').trim()

/** Parses the value of a GEDCOM NAME line */
export function parseGedcomName(value: string): GedcomName {
  const text = value.trim()
  // "Jan /Mikulik/", "/Mikulik/", "Jan Jakub /Novák/ ml."
  const match = text.match(/^([^/]*)\/([^/]*)\/(.*)$/)
  if (!match) return { full: stripSurnameSlashes(text), given: '', surname: '', prefix: '', suffix: '' }
  const given = match[1]!.trim()
  const surname = match[2]!.trim()
  const suffix = match[3]!.trim()
  return { full: [given, surname, suffix].filter(Boolean).join(' '), given, surname, prefix: '', suffix }
}

/** Value of a GEDCOM NAME line for export */
export function nameToGedcom(name: GedcomName): string {
  if (!name.given && !name.surname) return name.full
  return [name.given, `/${name.surname}/`, name.suffix].filter(Boolean).join(' ')
}

// Birth name and married name. A person can have several NAME records; the one with "2 TYPE married" is the name after
// marriage (GEDCOM 5.5.1 NAME_TYPE), the first other one is the birth name (TYPE birth / maiden / none). MyHeritage
// writes the married surname as "2 _MARNM" under the birth name; the parser turns it into a married name.

export const isMarriedName = (name?: Pick<GedcomName, 'type'>): boolean => name?.type?.trim().toLowerCase() === 'married'

/** The birth name: the first name that is not a married name */
export const birthNameOf = (names: GedcomName[] = []): GedcomName | undefined => names.find(name => !isMarriedName(name))

/** The name after marriage, if recorded */
export const marriedNameOf = (names: GedcomName[] = []): GedcomName | undefined => names.find(isMarriedName)

/** The name a person is shown under: the married name when there is one, otherwise the birth name */
export const primaryNameOf = (names: GedcomName[] = []): GedcomName | undefined => marriedNameOf(names) ?? birthNameOf(names)

const nameText = (name?: GedcomName): string =>
  name ? stripSurnameSlashes(name.full || [name.given, name.surname].filter(Boolean).join(' ')) : ''

/**
 * Name for display: "Marie Dvořáková (roz. Nováková)" when a married name is recorded, otherwise the birth name.
 * `born` is the word before the birth surname ("roz." / "née"); the default "*" is the genealogical sign for "born".
 */
export function formatPersonName(names: GedcomName[] = [], born = '*'): string {
  const birth = birthNameOf(names)
  const married = marriedNameOf(names)
  const marriedText = nameText(married)
  const birthText = nameText(birth)
  if (!marriedText) return birthText
  if (!birthText || birthText === marriedText) return marriedText
  // Only the surname when the given name is the same ("Marie Dvořáková (roz. Nováková)")
  const birthPart = birth?.surname && (!birth.given || birth.given === married?.given) ? birth.surname : birthText
  return `${marriedText} (${born}${born.endsWith('*') ? '' : ' '}${birthPart})`
}
