// GEDCOM Type Definitions
import type { LatLngTuple as LngLat } from 'leaflet'

export interface GedcomLine {
  level: number
  tag: string
  value: string
  xrefId?: string
}

export interface GedcomFile {
  version: string
  encoding: string
  source: string
  date: Date
  copyright?: string
  individuals: Map<string, GedcomIndividual>
  families: Map<string, GedcomFamily>
  sources: Map<string, GedcomSource>
  repositories: Map<string, GedcomRepository>
  multimedia: Map<string, GedcomMultimedia>
  notes: Map<string, GedcomNote>
  metadata: GedcomMetadata
  rawLines?: GedcomLine[]
  // Revision of the tree saved on the server (grows with every saved change, server/utils/treeStore.ts)
  revision?: number
}

export interface GedcomIndividual {
  xrefId: string
  names: GedcomName[]
  sex: 'M' | 'F' | ''
  birth?: GedcomEvent
  baptism?: GedcomEvent
  christening?: GedcomEvent
  death?: GedcomEvent
  burial?: GedcomEvent
  cremation?: GedcomEvent
  marriages?: GedcomEvent[]
  divorces?: GedcomEvent[]
  engagements?: GedcomEvent[]
  events: GedcomEvent[]
  familiesAsChild: string[]
  familiesAsSpouse: string[]
  associations: GedcomAssociation[]
  multimediaLinks: string[]
  notes: string[]
  sourceCitations: GedcomSourceCitation[]
  attributes: Record<string, string[]>
  userData: Record<string, any>
  // Sources of the sex (OBJE records, "2 OBJE" under SEX)
  sexLinks?: string[]
  // Citations of source records under SEX ("2 SOUR @S1@")
  sexCitations?: GedcomSourceCitation[]
  // Recorded as living ("1 _LIVING Y"); a death event means deceased, neither means unknown
  living?: boolean
}

export interface GedcomFamily {
  xrefId: string
  husband?: string
  wife?: string
  children: string[]
  marriage?: GedcomEvent
  divorce?: GedcomEvent
  engagements?: GedcomEvent[]
  childCount?: number
  notes: string[]
  sourceCitations: GedcomSourceCitation[]
  multimediaLinks: string[]
  userData: Record<string, any>
}

export interface GedcomName {
  full: string
  given: string
  surname: string
  prefix?: string
  suffix?: string
  nickname?: string
  type?: string
  // Sources of the name (OBJE records, "2 OBJE" under NAME)
  multimediaLinks?: string[]
  // Citations of source records ("2 SOUR @S1@" under NAME)
  sourceCitations?: GedcomSourceCitation[]
}

export interface GedcomEvent {
  type: GedcomEventType
  date?: GedcomDate
  place?: string
  address?: GedcomAddress
  age?: string
  cause?: string
  description?: string
  sourceCitations?: GedcomSourceCitation[]
  notes?: string[]
  multimediaLinks?: string[]
  coordinates?: LngLat
  sortDate?: Date
}

export interface GedcomDate {
  raw: string
  parsed?: Date | null
  day?: number
  month?: number | string
  year?: number
  date1?: Date | null
  date2?: Date | null
  range?: boolean
  from?: boolean
  to?: boolean
  about?: boolean
  after?: boolean
  before?: boolean
  estimated?: boolean
  calculated?: boolean
  calendar?: GedcomCalendar
  text?: string
}

export type GedcomCalendar = 'GREGORIAN' | 'JULIAN' | 'HEBREW' | 'FRENCH' | 'ROMAN' | 'UNKNOWN'

export interface GedcomAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

// A source record (GEDCOM SOUR), e.g. one entry of a parish register: title, archive (REPO record), book (PUBL),
// transcript of the original (TEXT), translation (NOTE), links and images (OBJE) and the people in it with their roles
// (our own tag _PART), see utils/gedcom/sources.ts
export interface GedcomSource {
  xrefId: string
  title: string
  author?: string
  publication?: string
  // Id of the REPO record (archive); text when the file names the archive without a record
  repository?: string
  // Transcript of the original
  text?: string
  type?: string
  multimediaLinks: string[]
  // The translation is the first note ("Překlad" in the editor)
  notes: string[]
  userData: Record<string, any>
  // Language of the record (cs, de, la…), our own tag _LANG
  language?: string
  // Who checked the record and when, our own tags _VERIFIED_BY and _VERIFIED_AT
  verifiedBy?: string
  verifiedAt?: string
  // People in the record with their roles, our own tag "1 _PART @I1@" with "2 ROLE", "2 AGE", "2 NOTE"
  participants?: GedcomSourceParticipant[]
}

export type SourceRole = 'baptized' | 'father' | 'mother' | 'godparent' | 'witness' | 'groom' | 'bride' | 'deceased' | 'household' | 'other'

export interface GedcomSourceParticipant {
  person: string
  role: SourceRole
  age?: string
  note?: string
}

// A citation of a source record: "n SOUR @S1@" with PAGE (image, entry number), DATA/TEXT (the entry), QUAY and NOTE
export interface GedcomSourceCitation {
  xref: string
  page?: string
  text?: string
  // GEDCOM QUAY: 3 stated directly in the record, 2 probable, 1 from the family, 0 from someone else's work
  confidence?: GedcomConfidenceLevel
  notes?: string
}

export type GedcomConfidenceLevel = 0 | 1 | 2 | 3

export interface GedcomRepository {
  xrefId: string
  name: string
  address?: GedcomAddress
  phone?: string[]
  email?: string[]
  web?: string[]
  notes: string[]
  userData: Record<string, any>
}

export interface GedcomMultimedia {
  xrefId: string
  file?: string
  title?: string
  format?: string
  path?: string
  url?: string
  notes: string[]
  userData: Record<string, any>
}

export interface GedcomNote {
  xrefId: string
  text: string
  source?: string
  userData: Record<string, any>
}

// "1 ASSO @I2@ / 2 RELA godparent" in the record of I1: I2 is the godparent of I1. Associations made from the roles
// of a source record cite that source ("2 SOUR @S1@"), so they can be kept in sync with it (utils/gedcom/sources.ts)
export interface GedcomAssociation {
  individualXref: string
  relationship: string
  description?: string
  sourceCitations?: GedcomSourceCitation[]
}

export interface GedcomMetadata {
  totalIndividuals: number
  totalFamilies: number
  totalSources: number
  totalRepositories: number
  totalMultimedia: number
  totalNotes: number
  totalGenerations: number
  earliestDate?: Date
  latestDate?: Date
  minLat?: number
  maxLat?: number
  minLng?: number
  maxLng?: number
}

export type GedcomEventType =
  | 'BIRT' | 'CHR' | 'BAPM' | 'DEAT' | 'BURI' | 'CREM'
  | 'MARR' | 'DIV' | 'ENGA' | 'ADOP'
  | 'CENS' | 'RESI' | 'OCCU' | 'EDUC' | 'RETI'
  | 'EMIG' | 'IMMI' | 'MILI' | 'RELI'
  | 'EVEN' | 'FACT' | 'NAME' | 'SEX' | 'FAMC' | 'FAMS'

export interface AppPerson {
  id: string
  xrefId?: string
  // Name for display: the married name with the birth surname when recorded (formatPersonName)
  fullName: string
  // All names (birth name, married name…), see utils/gedcom/names.ts
  names?: GedcomName[]
  shortName: string
  lifespan?: string
  sex: 'M' | 'F' | ''
  birth?: GedcomEvent
  death?: GedcomEvent
  allCoordinates?: [number, number, GedcomEventType][]
  father?: AppPerson | null
  mother?: AppPerson | null
  spouses: AppPerson[]
  children: AppPerson[]
  siblings: AppPerson[]
  generation: number
  isRoot?: boolean
  expanded?: boolean
  notes?: string
  userData?: Record<string, any>
}

export interface MapEvent {
  id: string
  personId: string
  personName: string
  type: GedcomEventType
  date?: string
  place?: string
  description?: string
  // Cause of death (GEDCOM CAUS)
  cause?: string
  coordinates: LngLat
  color: string
  icon: string
  clusterId?: string
}

export interface FamilyTree {
  root: AppPerson
  people: Map<string, AppPerson>
  families: Map<string, GedcomFamily>
  generations: number
  depth: number
  bounds: { minDate?: Date; maxDate?: Date; minLat?: number; maxLat?: number; minLng?: number; maxLng?: number }
}

export interface GedcomParseResult {
  file: GedcomFile
  warnings: string[]
  errors: string[]
  stats: { linesProcessed: number; recordsCreated: number; parsingTime: number }
}

export interface GedcomParseOptions {
  maxLines?: number
  resolveXrefs?: boolean
  extractCoordinates?: boolean
  placeMappings?: Record<string, LngLat>
}

export interface GedcomExportOptions {
  version?: '5.5' | '7.0'
  encoding?: 'UTF-8' | 'ANSI'
  includeMultimedia?: boolean
  includeNotes?: boolean
  application?: string
}
