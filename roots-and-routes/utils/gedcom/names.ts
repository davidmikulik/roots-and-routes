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
