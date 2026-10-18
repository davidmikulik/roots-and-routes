export const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTHS = GEDCOM_MONTHS

// Words of the GEDCOM date qualifiers in the languages of the app
const WORDS: Record<'cs' | 'en', Record<string, string>> = {
  cs: { ABT: 'asi', EST: 'odhadem', CAL: 'vypočteno', BEF: 'před', AFT: 'po', BET: 'mezi', AND: 'a', FROM: 'od', TO: 'do' },
  en: { ABT: 'about', EST: 'estimated', CAL: 'calculated', BEF: 'before', AFT: 'after', BET: 'between', AND: 'and', FROM: 'from', TO: 'to' },
}

// A date without a qualifier: "4 MAR 1886", "MAR 1886" or "1886"
const SIMPLE_DATE = /^(?:(?:(\d{1,2})\s+)?([A-Za-z]{3})\s+)?(\d{3,4})$/

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

// One simple date in words: "4. března 1886", "březen 1886", "1886"; null when it is not a simple date. After a
// preposition (`inflected`) Czech would need another case of the month ("po lednu"), so a month and year is written
// as numbers there ("po 1/1886").
function formatSimpleDate(text: string, locale: string, inflected = false): string | null {
  const match = SIMPLE_DATE.exec(text.trim())
  if (!match) return null
  const year = Number(match[3])
  if (!match[2]) return String(year)
  const month = MONTHS.indexOf(match[2].toUpperCase())
  if (month < 0) return null
  if (!match[1]) {
    if (inflected && locale.startsWith('cs')) return `${month + 1}/${year}`
    return new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' })
  }
  const day = Number(match[1])
  // Rejects impossible dates such as 31 FEB, which Date would silently roll over into March
  if (day < 1 || day > daysInMonth(year, month)) return null
  return new Date(Date.UTC(year, month, day)).toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
}

// Formats a GEDCOM date text for display in the given locale: "4 MAR 1886" → "4. března 1886", "MAR 1886" →
// "březen 1886", "ABT 1886" → "asi 1886", "BET 1880 AND 1885" → "mezi 1880 a 1885". Anything else is shown as it was
// written. Works on the text, not on the parsed Date, which can be shifted by a day between time zones.
export function formatGedcomDate(raw: string | undefined, locale: string): string {
  const text = (raw || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const words = WORDS[locale.startsWith('cs') ? 'cs' : 'en']
  const simple = formatSimpleDate(text, locale)
  if (simple) return simple
  const range = /^(BET|FROM)\s+(.+?)\s+(AND|TO)\s+(.+)$/i.exec(text)
  if (range) {
    const first = formatSimpleDate(range[2]!, locale, true)
    const second = formatSimpleDate(range[4]!, locale, true)
    if (first && second) return `${words[range[1]!.toUpperCase()]} ${first} ${words[range[3]!.toUpperCase()]} ${second}`
  }
  const qualified = /^(ABT|EST|CAL|BEF|AFT|FROM|TO)\s+(.+)$/i.exec(text)
  if (qualified) {
    const date = formatSimpleDate(qualified[2]!, locale, true)
    if (date) return `${words[qualified[1]!.toUpperCase()]} ${date}`
  }
  return text
}

// ---- Entering a date by parts (app/components/GedcomDateInput.vue): a qualifier, an optional day and month, a year

export type DateQualifier = '' | 'ABT' | 'EST' | 'CAL' | 'BEF' | 'AFT'
export const DATE_QUALIFIERS: DateQualifier[] = ['', 'ABT', 'BEF', 'AFT', 'EST', 'CAL']

export interface DateParts {
  qualifier: DateQualifier
  // '' or 1–31
  day: string
  // '' or 1–12
  month: string
  year: string
}

/** The parts of a GEDCOM date text, or null when it cannot be entered by parts (a range, a phrase…) */
export function splitGedcomDate(raw: string | undefined): DateParts | null {
  const text = (raw || '').trim().replace(/\s+/g, ' ')
  if (!text) return { qualifier: '', day: '', month: '', year: '' }
  const qualified = /^(ABT|EST|CAL|BEF|AFT)\s+(.+)$/i.exec(text)
  const qualifier = (qualified?.[1]?.toUpperCase() ?? '') as DateQualifier
  const match = SIMPLE_DATE.exec(qualified ? qualified[2]! : text)
  if (!match) return null
  const month = match[2] ? MONTHS.indexOf(match[2].toUpperCase()) : -1
  if (match[2] && month < 0) return null
  const year = Number(match[3])
  const day = match[1] ? Number(match[1]) : 0
  if (day && (day < 1 || day > daysInMonth(year, month))) return null
  return { qualifier, day: day ? String(day) : '', month: month >= 0 ? String(month + 1) : '', year: String(year) }
}

/** GEDCOM date text from the parts ("ABT 4 MAR 1886"); empty without a year. A day needs a month. */
export function joinGedcomDate(parts: DateParts): string {
  const year = parts.year.trim()
  if (!/^\d{3,4}$/.test(year)) return ''
  const month = Number(parts.month)
  const date = [
    month >= 1 && month <= 12 && parts.day ? String(Number(parts.day)) : '',
    month >= 1 && month <= 12 ? MONTHS[month - 1] : '',
    String(Number(year)),
  ].filter(Boolean).join(' ')
  return parts.qualifier ? `${parts.qualifier} ${date}` : date
}

export { daysInMonth }
