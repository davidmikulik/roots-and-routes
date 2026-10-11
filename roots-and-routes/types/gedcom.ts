// GEDCOM Type Definitions
import type { LngLat } from 'leaflet'

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
  date1?: Date
  date2?: Date
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

export interface GedcomSource {
  xrefId: string
  title: string
  author?: string
  publication?: string
  repository?: string
  text?: string
  type?: string
  multimediaLinks: string[]
  notes: string[]
  userData: Record<string, any>
}

export interface GedcomSourceCitation {
  xref: string
  page?: string
  text?: string
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

export interface GedcomAssociation {
  individualXref: string
  relationship: string
  description?: string
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
  fullName: string
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
