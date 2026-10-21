// Age of a person: the current age of a living person, the length of life of a deceased one. A person without a death
// record (no date of death, not marked deceased) is living. Unknown when a needed date is missing. Dates may be
// incomplete ("1850", "MAR 1850", "ABT 1850", "BET 1850 AND 1860"): the age is then approximate.
import type { GedcomEvent } from '~~/types/gedcom'
import { splitGedcomDate } from '~~/utils/gedcom/dates'

export type AgeKind = 'living' | 'lifespan' | 'unknown'

export interface PersonAge {
  kind: AgeKind
  // Whole years; missing when unknown
  years?: number
  // An incomplete or uncertain date: the age may be a year off (or more)
  approximate?: boolean
}

// `certain`: no qualifier (ABT, BEF…), not a range or a phrase
interface DatePoint { year: number; month?: number; day?: number; certain: boolean }

// The point of a GEDCOM date text; a range or a phrase gives its first year, not exact
const pointOf = (raw?: string): DatePoint | null => {
  const parts = splitGedcomDate(raw)
  if (parts && parts.year) {
    const month = parts.month ? Number(parts.month) : undefined
    const day = parts.day ? Number(parts.day) : undefined
    return { year: Number(parts.year), month, day, certain: !parts.qualifier }
  }
  const year = Number(raw?.match(/\b\d{3,4}\b/)?.[0])
  return year ? { year, certain: false } : null
}

// Whole years between two points. Exact when both dates are certain and it is known whether the birthday had come:
// both months known and different, or both full dates.
const yearsBetween = (from: DatePoint, to: DatePoint): { years: number; approximate: boolean } => {
  let years = to.year - from.year
  const decidable = !!from.month && !!to.month && (from.month !== to.month || (!!from.day && !!to.day))
  if (decidable && (to.month! < from.month! || (to.month === from.month && to.day! < from.day!))) years--
  return { years, approximate: !from.certain || !to.certain || !decidable }
}

export function personAge(person: { birth?: GedcomEvent; death?: GedcomEvent }, today: Date = new Date()): PersonAge {
  const birth = pointOf(person.birth?.date?.raw)
  if (person.death) {
    const death = pointOf(person.death.date?.raw)
    if (!birth || !death) return { kind: 'unknown' }
    const { years, approximate } = yearsBetween(birth, death)
    return years >= 0 ? { kind: 'lifespan', years, approximate } : { kind: 'unknown' }
  }
  if (!birth) return { kind: 'unknown' }
  const now: DatePoint = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate(), certain: true }
  const { years, approximate } = yearsBetween(birth, now)
  return years >= 0 ? { kind: 'living', years, approximate } : { kind: 'unknown' }
}
