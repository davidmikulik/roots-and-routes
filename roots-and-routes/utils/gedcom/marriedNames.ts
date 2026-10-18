// One-off: names after marriage taken over from the original GEDCOM (uploads/gedcom/current.ged) into the current tree.
// The tree on the server was parsed before the parser read married names (MyHeritage "_MARNM", "TYPE married"), and
// saving only rewrites the parsed data, so the original file still has them. Only people with the same id and the
// same birth name get one, and only when they have none yet, so later edits are never overwritten.
import type { GedcomFile } from '~~/types/gedcom'
import { birthNameOf, marriedNameOf } from './names'

export interface MarriedNamesResult {
  // Married names that were (or would be) added
  added: number
  // People with a married name in the original whose birth name differs now (skipped)
  mismatched: number
  // People who already have a married name (skipped)
  alreadySet: number
}

const normalize = (text = ''): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

export function takeMarriedNames(target: GedcomFile, original: GedcomFile, apply: boolean): MarriedNamesResult {
  const result: MarriedNamesResult = { added: 0, mismatched: 0, alreadySet: 0 }
  for (const [id, source] of original.individuals) {
    const married = marriedNameOf(source.names)
    if (!married) continue
    const person = target.individuals.get(id)
    const birth = person ? birthNameOf(person.names) : undefined
    if (!person || !birth || normalize(birth.full) !== normalize(birthNameOf(source.names)?.full)) {
      result.mismatched++
      continue
    }
    if (marriedNameOf(person.names)) {
      result.alreadySet++
      continue
    }
    result.added++
    if (!apply) continue
    if (!birth.type) birth.type = 'birth'
    const index = person.names.indexOf(birth)
    person.names.splice(index + 1, 0, { ...married, type: 'married' })
  }
  return result
}
