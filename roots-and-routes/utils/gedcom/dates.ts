const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const FULL_DATE = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/

// Formats a GEDCOM date text for display. A complete date ("4 MAR 1886") is written out in the given locale
// ("4. března 1886"); anything else ("ABT 1886", "1886", "BET 1880 AND 1885") is shown as it was written.
// Works on the text, not on the parsed Date, which can be shifted by a day between time zones.
export function formatGedcomDate(raw: string | undefined, locale: string): string {
  const text = (raw || '').trim()
  const match = FULL_DATE.exec(text)
  if (!match) return text
  const month = MONTHS.indexOf(match[2]!.toUpperCase())
  const day = Number(match[1])
  const year = Number(match[3])
  if (month < 0 || day < 1 || day > 31) return text
  const date = new Date(Date.UTC(year, month, day))
  // Rejects impossible dates such as 31 FEB, which Date would silently roll over into March
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return text
  return date.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
}
