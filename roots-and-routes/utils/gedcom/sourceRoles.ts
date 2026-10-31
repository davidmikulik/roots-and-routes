// Roles of people in a source record (GedcomSource.participants, GEDCOM "1 _PART @I1@ / 2 ROLE godparent").
// The codes are English; batches of changes (POST /api/gedcom/changes) and imports may also use the Czech names.
import type { GedcomConfidenceLevel, SourceRole } from '~~/types/gedcom'

export const SOURCE_ROLES: SourceRole[] = ['baptized', 'father', 'mother', 'godparent', 'witness', 'groom', 'bride', 'deceased', 'household', 'other']

const fold = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

const ALIASES: Record<string, SourceRole> = {
  krtenec: 'baptized', krtenka: 'baptized', baptized: 'baptized', child: 'baptized', dite: 'baptized',
  otec: 'father', father: 'father',
  matka: 'mother', mother: 'mother',
  kmotr: 'godparent', kmotra: 'godparent', godparent: 'godparent', godfather: 'godparent', godmother: 'godparent',
  svedek: 'witness', svedkyne: 'witness', witness: 'witness',
  zenich: 'groom', groom: 'groom', husband: 'groom',
  nevesta: 'bride', bride: 'bride', wife: 'bride',
  zemrely: 'deceased', zemrela: 'deceased', deceased: 'deceased',
  'clen domacnosti': 'household', household: 'household', 'household member': 'household',
  jine: 'other', jiny: 'other', other: 'other',
}

// A role code from a code or a Czech or English name; anything else is "other"
export const normalizeSourceRole = (value: string): SourceRole => ALIASES[fold(value || '')] ?? 'other'

export const isSourceRole = (value: unknown): value is SourceRole => SOURCE_ROLES.includes(value as SourceRole)

// Roles whose people are the subject of the record (the godparents and witnesses are linked to them by ASSO)
export const PRINCIPAL_ROLES: SourceRole[] = ['baptized', 'deceased', 'groom', 'bride']

// ASSO "RELA" of the roles that make an association
export const ASSOCIATION_ROLES: Partial<Record<SourceRole, string>> = { godparent: 'godparent', witness: 'witness' }

// The role a person gets when a fact of theirs cites the source (birth → baptized, death → deceased, marriage → groom
// or bride by sex); other facts give no role
export const roleForFact = (fact: string, sex: 'M' | 'F' | ''): SourceRole | null => {
  switch (fact) {
    case 'birth': case 'BIRT': case 'BAPM': case 'CHR': return 'baptized'
    case 'death': case 'DEAT': case 'BURI': return 'deceased'
    case 'marriage': case 'MARR': return sex === 'F' ? 'bride' : sex === 'M' ? 'groom' : 'other'
    case 'CENS': case 'RESI': return 'household'
    default: return null
  }
}

export const CONFIDENCE_LEVELS: GedcomConfidenceLevel[] = [3, 2, 1, 0]

export const isConfidence = (value: unknown): value is GedcomConfidenceLevel => [0, 1, 2, 3].includes(value as number)
