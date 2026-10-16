import type { GedcomEventType } from '~~/types/gedcom'

// GEDCOM tags that are events or attributes of a person or family. Any other tag (MyHeritage's _UPD, _UID, RIN, …)
// is not an event: the parser keeps it in userData.extraTags and writes it back unchanged.
export const EVENT_TYPES: GedcomEventType[] = [
  'BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM',
  'MARR', 'DIV', 'ENGA', 'ADOP', 'CENS', 'RESI',
  'OCCU', 'EDUC', 'RETI', 'EMIG', 'IMMI', 'MILI', 'RELI', 'EVEN', 'FACT',
]

export interface ExtraTag { tag: string; value: string }
