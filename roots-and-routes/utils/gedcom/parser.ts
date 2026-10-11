// Custom GEDCOM Parser - Complete implementation
import type { LatLngTuple as LngLat } from 'leaflet'
import type {
  GedcomFile, GedcomLine, GedcomIndividual, GedcomFamily, GedcomName,
  GedcomEvent, GedcomDate, GedcomSource, GedcomSourceCitation, GedcomRepository,
  GedcomMultimedia, GedcomNote, GedcomMetadata, GedcomParseResult,
  GedcomParseOptions, GedcomEventType, AppPerson, MapEvent, FamilyTree,
  GedcomCalendar, GedcomConfidenceLevel, GedcomAddress, GedcomAssociation
} from '~~/types/gedcom'

// Constants
const DEFAULT_OPTIONS: GedcomParseOptions = { maxLines: 0, resolveXrefs: true, extractCoordinates: false }
const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
const CZECH_MONTHS: Record<string, number> = { LEDEN: 0, ÚNOR: 1, BŘEZEN: 2, DUBEN: 3, KVĚTEN: 4, ČERVEN: 5, ČERVENEC: 6, SRPEN: 7, ZÁŘÍ: 8, ŘÍJEN: 9, LISTOPAD: 10, PROSINEC: 11 }
const RECORD_TAGS = ['INDI', 'FAM', 'SOUR', 'REPO', 'NOTE', 'OBJE', 'SUBM', 'HEAD', 'TRLR']
const normalizeXref = (value: string): string => value.replace(/^@|@$/g, '')

// Event type mapping
const EVENT_TYPES: GedcomEventType[] = [
  'BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM',
  'MARR', 'DIV', 'ENGA', 'ADOP', 'CENS', 'RESI',
  'OCCU', 'EDUC', 'RETI', 'EMIG', 'IMMI', 'MILI', 'RELI', 'EVEN', 'FACT'
]

// Color mapping for event types
const EVENT_COLORS: Record<GedcomEventType, string> = {
  BIRT: '#4CAF50', CHR: '#4CAF50', BAPM: '#4CAF50',
  DEAT: '#F44336', BURI: '#F44336', CREM: '#F44336',
  MARR: '#E91E63', DIV: '#9C27B0', ENGA: '#E91E63',
  ADOP: '#FF9800', CENS: '#2196F3', RESI: '#2196F3',
  OCCU: '#607D8B', EDUC: '#607D8B', RETI: '#795548',
  EMIG: '#3F51B5', IMMI: '#3F51B5', MILI: '#673AB7', RELI: '#9C27B0',
  EVEN: '#9E9E9E', FACT: '#9E9E9E',
  NAME: '#9E9E9E', SEX: '#9E9E9E', FAMC: '#9E9E9E', FAMS: '#9E9E9E'
}

// Icon mapping for event types
const EVENT_ICONS: Record<GedcomEventType, string> = {
  BIRT: '👶', CHR: '👶', BAPM: '👶',
  DEAT: '⚰️', BURI: '⚰️', CREM: '⚰️',
  MARR: '💍', DIV: '💔', ENGA: '💍',
  ADOP: '👨‍👩‍👧', CENS: '📄', RESI: '🏠',
  OCCU: '💼', EDUC: '🎓', RETI: '👵',
  EMIG: '✈️', IMMI: '✈️', MILI: '🎖️', RELI: '⛪',
  EVEN: '⚪', FACT: '⚪',
  NAME: '⚪', SEX: '⚪', FAMC: '⚪', FAMS: '⚪'
}

class GedcomParser {
  private lines: GedcomLine[] = []
  private options: GedcomParseOptions
  private currentIndividualEvent: GedcomEvent | null = null
  private currentFamilyEvent: GedcomEvent | null = null
  
  constructor(options: GedcomParseOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  parse(content: string): GedcomParseResult {
    const startTime = Date.now()
    const rawLines = content.split(/\r?\n/)
    this.lines = []
    
    for (const rawLine of rawLines) {
      const line = this.parseLine(rawLine)
      if (line) this.lines.push(line)
      if (this.options.maxLines && this.lines.length >= this.options.maxLines) break
    }
    
    const file = this.processLines()
    
    if (this.options.resolveXrefs) this.resolveXrefs(file)
    if (this.options.extractCoordinates) this.extractCoordinates(file)
    
    const parsingTime = Date.now() - startTime
    return {
      file,
      warnings: [],
      errors: [],
      stats: {
        linesProcessed: this.lines.length,
        recordsCreated: file.individuals.size + file.families.size,
        parsingTime
      }
    }
  }

  private parseLine(line: string): GedcomLine | null {
    if (!line.trim()) return null
    const levelMatch = line.match(/^(\d+)/)
    if (!levelMatch) return null
    const level = parseInt(levelMatch[1], 10)
    const rest = line.substring(levelMatch[0].length).trim()
    let tag = rest
    let xrefId: string | undefined
    
    const xrefMatch = rest.match(/^@([^@]+)@/)
    if (xrefMatch) {
      xrefId = xrefMatch[1]
      tag = rest.substring(xrefMatch[0].length).trim()
    }
    const separator = tag.indexOf(' ')
    const value = separator === -1 ? '' : tag.slice(separator + 1).trim()
    tag = separator === -1 ? tag : tag.slice(0, separator)
    return { level, tag, value, xrefId }
  }

  private processLines(): GedcomFile {
    const file: GedcomFile = {
      version: '5.5',
      encoding: 'UTF-8',
      source: '',
      date: new Date(),
      individuals: new Map(),
      families: new Map(),
      sources: new Map(),
      repositories: new Map(),
      multimedia: new Map(),
      notes: new Map(),
      metadata: {
        totalIndividuals: 0,
        totalFamilies: 0,
        totalSources: 0,
        totalRepositories: 0,
        totalMultimedia: 0,
        totalNotes: 0,
        totalGenerations: 0
      },
      rawLines: this.options.maxLines ? this.lines.slice(0, this.options.maxLines) : this.lines,
    }
    
    let currentRecord: { type: string; xrefId: string; data: any } | null = null
    
    for (const line of this.lines) {
      if (line.level === 0) {
        if (currentRecord) this.saveRecord(currentRecord, file)
        this.currentIndividualEvent = null
        this.currentFamilyEvent = null
        
        if (line.xrefId && RECORD_TAGS.includes(line.tag)) {
          currentRecord = { type: line.tag, xrefId: line.xrefId, data: this.createRecord(line.tag, line.xrefId) }
        } else if (line.tag === 'HEAD') {
          this.processHeader(line, file)
        } else if (line.tag === 'TRLR') {
          break
        }
        continue
      }
      
      if (currentRecord) {
        this.processLine(line, currentRecord)
      }
    }
    
    if (currentRecord) {
      this.saveRecord(currentRecord, file)
    }
    
    this.calculateMetadata(file)
    return file
  }

  private processHeader(line: GedcomLine, file: GedcomFile) {
    if (line.level === 0 && line.tag === 'HEAD') {
      file.source = 'GEDCOM Import'
    }
  }

  private createRecord(tag: string, xrefId: string): any {
    switch (tag) {
      case 'INDI': return this.createIndividual(xrefId)
      case 'FAM': return this.createFamily(xrefId)
      case 'SOUR': return this.createSource(xrefId)
      case 'REPO': return this.createRepository(xrefId)
      case 'NOTE': return this.createNote(xrefId)
      case 'OBJE': return this.createMultimedia(xrefId)
      default: return {}
    }
  }

  private createIndividual(xrefId: string): GedcomIndividual {
    return {
      xrefId,
      names: [],
      sex: '',
      events: [],
      familiesAsChild: [],
      familiesAsSpouse: [],
      associations: [],
      multimediaLinks: [],
      notes: [],
      sourceCitations: [],
      attributes: {},
      userData: {}
    }
  }

  private createFamily(xrefId: string): GedcomFamily {
    return {
      xrefId,
      children: [],
      multimediaLinks: [],
      notes: [],
      sourceCitations: [],
      userData: {}
    }
  }

  private createSource(xrefId: string): GedcomSource {
    return {
      xrefId,
      title: '',
      multimediaLinks: [],
      notes: [],
      userData: {}
    }
  }

  private createRepository(xrefId: string): GedcomRepository {
    return {
      xrefId,
      name: '',
      phone: [],
      email: [],
      web: [],
      notes: [],
      userData: {}
    }
  }

  private createNote(xrefId: string): GedcomNote {
    return { xrefId, text: '', userData: {} }
  }

  private createMultimedia(xrefId: string): GedcomMultimedia {
    return { xrefId, notes: [], userData: {} }
  }

  private saveRecord(record: { type: string; xrefId: string; data: any }, file: GedcomFile) {
    switch (record.type) {
      case 'INDI':
        file.individuals.set(record.xrefId, record.data as GedcomIndividual)
        file.metadata.totalIndividuals++
        break
      case 'FAM':
        file.families.set(record.xrefId, record.data as GedcomFamily)
        file.metadata.totalFamilies++
        break
      case 'SOUR':
        file.sources.set(record.xrefId, record.data as GedcomSource)
        file.metadata.totalSources++
        break
      case 'REPO':
        file.repositories.set(record.xrefId, record.data as GedcomRepository)
        file.metadata.totalRepositories++
        break
      case 'NOTE':
        file.notes.set(record.xrefId, record.data as GedcomNote)
        file.metadata.totalNotes++
        break
      case 'OBJE':
        file.multimedia.set(record.xrefId, record.data as GedcomMultimedia)
        file.metadata.totalMultimedia++
        break
    }
  }

  private processLine(line: GedcomLine, currentRecord: { type: string; xrefId: string; data: any }) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    
    switch (currentRecord.type) {
      case 'INDI':
        this.processIndividualLine(line, currentRecord.data as GedcomIndividual)
        break
      case 'FAM':
        this.processFamilyLine(line, currentRecord.data as GedcomFamily)
        break
      case 'SOUR':
        this.processSourceLine(line, currentRecord.data as GedcomSource)
        break
      case 'REPO':
        this.processRepositoryLine(line, currentRecord.data as GedcomRepository)
        break
      case 'NOTE':
        this.processNoteLine(line, currentRecord.data as GedcomNote)
        break
      case 'OBJE':
        this.processMultimediaLine(line, currentRecord.data as GedcomMultimedia)
        break
    }
  }

  private processIndividualLine(line: GedcomLine, individual: GedcomIndividual) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId

    if (line.level > 1 && this.currentIndividualEvent) {
      this.processEventDetail(line, this.currentIndividualEvent)
      return
    }

    this.currentIndividualEvent = null
    
    switch (tag) {
      case 'NAME':
        individual.names.push(this.parseName(value))
        break
      case 'SEX':
        individual.sex = value === 'M' ? 'M' : value === 'F' ? 'F' : ''
        break
      case 'FAMC':
        if (value) individual.familiesAsChild.push(normalizeXref(value))
        break
      case 'FAMS':
        if (value) individual.familiesAsSpouse.push(normalizeXref(value))
        break
      case 'NOTE':
        if (xrefId) individual.notes.push(xrefId)
        else if (value) individual.notes.push(value)
        break
      case 'SOUR':
        individual.sourceCitations.push({ xref: normalizeXref(value), page: '', confidence: 2 })
        break
      case 'OBJE':
        if (value) individual.multimediaLinks.push(normalizeXref(value))
        break
      case 'ASSO':
        individual.associations.push({ individualXref: normalizeXref(value), relationship: '', description: '' })
        break
      default:
        if (EVENT_TYPES.includes(tag as GedcomEventType)) {
          const event = this.createEvent(tag as GedcomEventType, value)
          const eventKeys: Partial<Record<GedcomEventType, keyof GedcomIndividual>> = {
            BIRT: 'birth', BAPM: 'baptism', CHR: 'christening', DEAT: 'death', BURI: 'burial', CREM: 'cremation',
          }
          const key = eventKeys[tag as GedcomEventType]
          if (key) (individual[key] as GedcomEvent | undefined) = event
          else individual.events.push(event)
          this.currentIndividualEvent = event
        } else if (line.level === 1) {
          const event = this.createEvent(tag as GedcomEventType, value)
          individual.events.push(event)
          this.currentIndividualEvent = event
        } else {
          if (!individual.attributes[tag]) individual.attributes[tag] = []
          individual.attributes[tag].push(value)
        }
        break
    }
  }

  private processFamilyLine(line: GedcomLine, family: GedcomFamily) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId

    if (line.level > 1 && this.currentFamilyEvent) {
      this.processEventDetail(line, this.currentFamilyEvent)
      return
    }

    this.currentFamilyEvent = null
    
    switch (tag) {
      case 'HUSB':
        family.husband = normalizeXref(value)
        break
      case 'WIFE':
        family.wife = normalizeXref(value)
        break
      case 'CHIL':
        if (value) family.children.push(normalizeXref(value))
        break
      case 'NOTE':
        if (xrefId) family.notes.push(xrefId)
        else if (value) family.notes.push(value)
        break
      case 'SOUR':
        family.sourceCitations?.push({ xref: normalizeXref(value), page: '', confidence: 2 })
        break
      case 'OBJE':
        if (value) family.multimediaLinks.push(normalizeXref(value))
        break
      case 'MARR':
      case 'DIV':
      case 'ENGA':
        {
          const event = this.createEvent(tag as GedcomEventType, value)
          if (tag === 'MARR') family.marriage = event
          else if (tag === 'DIV') family.divorce = event
          else family.engagements = [...(family.engagements || []), event]
          this.currentFamilyEvent = event
        }
        break
      default:
        if (!family.userData[tag]) family.userData[tag] = []
        family.userData[tag].push(value)
        break
    }
  }

  private processEventDetail(line: GedcomLine, event: GedcomEvent) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    if (tag === 'DATE') event.date = this.parseDate(value)
    else if (tag === 'PLAC') event.place = value
    else if (tag === 'CAUS') event.cause = value
    else if (tag === 'AGE') event.age = value
    else if (tag === 'NOTE') event.description = value
    else if (tag === 'TYPE' && EVENT_TYPES.includes(value as GedcomEventType)) event.type = value as GedcomEventType
    else if (tag === 'LATI' || tag === 'LONG') {
      const direction = value.match(/[NSEW]/i)?.[0]?.toUpperCase()
      const number = Number(value.replace(/[NSEW]/gi, '').trim())
      if (!Number.isFinite(number)) return
      const coordinate = direction === 'S' || direction === 'W' ? -Math.abs(number) : Math.abs(number)
      const coordinates = event.coordinates || [Number.NaN, Number.NaN]
      if (tag === 'LATI') coordinates[0] = coordinate
      else coordinates[1] = coordinate
      event.coordinates = coordinates
    }
  }

  private processSourceLine(line: GedcomLine, source: GedcomSource) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId
    
    switch (tag) {
      case 'TITL':
        source.title = value
        break
      case 'AUTH':
        source.author = value
        break
      case 'PUBL':
        source.publication = value
        break
      case 'REPO':
        source.repository = value
        break
      case 'TEXT':
        source.text = value
        break
      case 'TYPE':
        source.type = value
        break
      case 'NOTE':
        if (xrefId) source.notes.push(xrefId)
        else if (value) source.notes.push(value)
        break
      case 'OBJE':
        if (value) source.multimediaLinks.push(value)
        break
    }
  }

  private processRepositoryLine(line: GedcomLine, repository: GedcomRepository) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId
    
    switch (tag) {
      case 'NAME':
        repository.name = value
        break
      case 'ADDR':
        repository.address = this.parseAddress(line, repository.address || {})
        break
      case 'PHON':
        if (value) repository.phone?.push(value)
        break
      case 'EMAIL':
        if (value) repository.email?.push(value)
        break
      case 'WWW':
      case 'URL':
        if (value) repository.web?.push(value)
        break
      case 'NOTE':
        if (xrefId) repository.notes.push(xrefId)
        else if (value) repository.notes.push(value)
        break
    }
  }

  private processNoteLine(line: GedcomLine, note: GedcomNote) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    
    if (tag === 'CONT' || tag === 'CONC') {
      note.text += value
    } else if (!note.text && value) {
      note.text = value
    }
  }

  private processMultimediaLine(line: GedcomLine, multimedia: GedcomMultimedia) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId
    
    switch (tag) {
      case 'FILE':
        multimedia.file = value
        break
      case 'TITL':
        multimedia.title = value
        break
      case 'FORM':
        multimedia.format = value
        break
      case 'NOTE':
        if (xrefId) multimedia.notes.push(xrefId)
        else if (value) multimedia.notes.push(value)
        break
    }
  }

  private parseName(nameString: string): GedcomName {
    const name: GedcomName = {
      full: nameString,
      given: '',
      surname: '',
      prefix: '',
      suffix: ''
    }
    
    // Simple name parsing: Given /Surname/
    const match = nameString.match(/^(.+)\s+\/(.+)\/\s*(.*)$/)
    if (match) {
      name.given = match[1].trim()
      name.surname = match[2].trim()
      name.suffix = match[3].trim()
    } else {
      name.full = nameString
    }
    
    return name
  }

  private createEvent(type: GedcomEventType, value: string): GedcomEvent {
    return {
      type,
      date: this.parseDate(value),
      place: '',
      description: value
    }
  }

  private parseDate(dateString: string): GedcomDate | undefined {
    if (!dateString) return undefined
    
    const date: GedcomDate = {
      raw: dateString,
      parsed: null,
      calendar: 'GREGORIAN'
    }
    
    // Handle date ranges and modifiers
    const aboutMatch = dateString.match(/^ABT\s+(.+)$/i)
    const estimatedMatch = dateString.match(/^EST\s+(.+)$/i)
    const calculatedMatch = dateString.match(/^CAL\s+(.+)$/i)
    const beforeMatch = dateString.match(/^BEF\s+(.+)$/i)
    const afterMatch = dateString.match(/^AFT\s+(.+)$/i)
    const betweenMatch = dateString.match(/^BET\s+(.+)\s+AND\s+(.+)$/i)
    const fromMatch = dateString.match(/^FROM\s+(.+)$/i)
    const toMatch = dateString.match(/^TO\s+(.+)$/i)
    
    let dateStr = dateString
    
    if (aboutMatch) {
      date.about = true
      dateStr = aboutMatch[1]
    } else if (estimatedMatch) {
      date.estimated = true
      dateStr = estimatedMatch[1]
    } else if (calculatedMatch) {
      date.calculated = true
      dateStr = calculatedMatch[1]
    } else if (beforeMatch) {
      date.before = true
      dateStr = beforeMatch[1]
    } else if (afterMatch) {
      date.after = true
      dateStr = afterMatch[1]
    } else if (betweenMatch) {
      date.range = true
      date.date1 = this.parseSimpleDate(betweenMatch[1])
      date.date2 = this.parseSimpleDate(betweenMatch[2])
      return date
    } else if (fromMatch) {
      date.from = true
      dateStr = fromMatch[1]
    } else if (toMatch) {
      date.to = true
      dateStr = toMatch[1]
    }
    
    const parsed = this.parseSimpleDate(dateStr)
    if (parsed) {
      date.parsed = parsed
      date.day = parsed.getDate()
      date.month = parsed.getMonth()
      date.year = parsed.getFullYear()
    }
    
    return date
  }

  private parseSimpleDate(dateStr: string): Date | null {
    // Try to parse DD MMM YYYY format
    const match1 = dateStr.match(/^(\d{1,2})\s+(\w{3,})\s+(\d{4})$/)
    if (match1) {
      const day = parseInt(match1[1], 10)
      const monthStr = match1[2].toUpperCase()
      const year = parseInt(match1[3], 10)
      
      const month = MONTHS[monthStr] ?? CZECH_MONTHS[monthStr]
      if (month !== undefined) {
        return new Date(year, month, day)
      }
    }
    
    // Try YYYY-MM-DD format
    const match2 = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match2) {
      const year = parseInt(match2[1], 10)
      const month = parseInt(match2[2], 10) - 1
      const day = parseInt(match2[3], 10)
      return new Date(year, month, day)
    }
    
    // Try MM/DD/YYYY format
    const match3 = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (match3) {
      const month = parseInt(match3[1], 10) - 1
      const day = parseInt(match3[2], 10)
      const year = parseInt(match3[3], 10)
      return new Date(year, month, day)
    }
    
    // Try YYYY format only
    const match4 = dateStr.match(/^(\d{4})$/)
    if (match4) {
      const year = parseInt(match4[1], 10)
      return new Date(year, 0, 1)
    }
    
    // Try MMM YYYY format
    const match5 = dateStr.match(/^(\w{3,})\s+(\d{4})$/)
    if (match5) {
      const monthStr = match5[1].toUpperCase()
      const year = parseInt(match5[2], 10)
      const month = MONTHS[monthStr] ?? CZECH_MONTHS[monthStr]
      if (month !== undefined) {
        return new Date(year, month, 1)
      }
    }
    
    return null
  }

  private parseAddress(line: GedcomLine, address: GedcomAddress): GedcomAddress {
    const tag = line.tag.toUpperCase()
    const value = line.value
    
    switch (tag) {
      case 'ADR1':
        address.line1 = value
        break
      case 'ADR2':
        address.line2 = value
        break
      case 'CITY':
        address.city = value
        break
      case 'STAE':
        address.state = value
        break
      case 'POST':
        address.postalCode = value
        break
      case 'CTRY':
        address.country = value
        break
    }
    
    return address
  }

  private resolveXrefs(file: GedcomFile) {
    for (const [familyId, family] of file.families) {
      for (const spouseId of [family.husband, family.wife]) {
        const spouse = spouseId ? file.individuals.get(spouseId) : undefined
        if (spouse && !spouse.familiesAsSpouse.includes(familyId)) spouse.familiesAsSpouse.push(familyId)
      }
      for (const childId of family.children) {
        const child = file.individuals.get(childId)
        if (child && !child.familiesAsChild.includes(familyId)) child.familiesAsChild.push(familyId)
      }
    }
    
    // Resolve source citations
    for (const [xrefId, source] of file.sources) {
      for (const individual of file.individuals.values()) {
        for (const citation of individual.sourceCitations) {
          if (citation.xref === xrefId) {
            citation.text = source.title
          }
        }
      }
    }
  }

  private extractCoordinates(file: GedcomFile) {
    for (const individual of file.individuals.values()) {
      const events = [individual.birth, individual.baptism, individual.christening, individual.death, individual.burial, individual.cremation, ...individual.events]
      for (const event of events) {
        if (event?.coordinates) {
          if (!file.metadata.minLat || event.coordinates[0] < file.metadata.minLat) {
            file.metadata.minLat = event.coordinates[0]
          }
          if (!file.metadata.maxLat || event.coordinates[0] > file.metadata.maxLat) {
            file.metadata.maxLat = event.coordinates[0]
          }
          if (!file.metadata.minLng || event.coordinates[1] < file.metadata.minLng) {
            file.metadata.minLng = event.coordinates[1]
          }
          if (!file.metadata.maxLng || event.coordinates[1] > file.metadata.maxLng) {
            file.metadata.maxLng = event.coordinates[1]
          }
        }
      }
    }
  }

  private calculateMetadata(file: GedcomFile) {
    let earliestDate: Date | undefined
    let latestDate: Date | undefined
    
    for (const individual of file.individuals.values()) {
      for (const event of individual.events) {
        if (event.date?.parsed) {
          if (!earliestDate || event.date.parsed < earliestDate) {
            earliestDate = event.date.parsed
          }
          if (!latestDate || event.date.parsed > latestDate) {
            latestDate = event.date.parsed
          }
        }
      }
    }
    
    file.metadata.earliestDate = earliestDate
    file.metadata.latestDate = latestDate
  }
}

// Main parse function
export function parseGedcom(content: string, options?: GedcomParseOptions): GedcomParseResult {
  const parser = new GedcomParser(options)
  return parser.parse(content)
}

// Write GEDCOM function
export function writeGedcom(file: GedcomFile, options?: { version?: '5.5' | '7.0'; encoding?: string }): string {
  const lines: string[] = []
  const version = options?.version || '5.5'
  const encoding = options?.encoding || 'UTF-8'
  const appendEventDetails = (event: GedcomEvent, level: number) => {
    if (event.date?.raw) lines.push(`${level} DATE ${event.date.raw}`)
    if (event.place) lines.push(`${level} PLAC ${event.place}`)
    if (event.cause) lines.push(`${level} CAUS ${event.cause}`)
    if (event.age) lines.push(`${level} AGE ${event.age}`)
    if (event.description) lines.push(`${level} NOTE ${event.description}`)
    const [latitude, longitude] = event.coordinates || []
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      lines.push(`${level} MAP`)
      lines.push(`${level + 1} LATI ${Math.abs(latitude!).toFixed(6)}${latitude! < 0 ? 'S' : 'N'}`)
      lines.push(`${level + 1} LONG ${Math.abs(longitude!).toFixed(6)}${longitude! < 0 ? 'W' : 'E'}`)
    }
  }
  
  // Header
  lines.push(`0 HEAD`)
  lines.push(`1 SOUR Roots & Routes`)
  lines.push(`2 VERS 1.0.0`)
  lines.push(`2 NAME Roots & Routes`)
  lines.push(`1 DEST Roots-And-Routes`)
  lines.push(`1 DATE ${new Date().toISOString().split('T')[0]}`)
  lines.push(`2 TIME ${new Date().toISOString().split('T')[1].split('.')[0]}`)
  lines.push(`1 GEDC`)
  lines.push(`2 VERS ${version}`)
  lines.push(`2 FORM LINEAGE-LINKED`)
  lines.push(`1 CHAR ${encoding}`)
  lines.push(`1 LANG Czech`)
  lines.push(`1 PLAC`)
  lines.push(`2 FORM City, State, Country`)
  
  // Individuals
  for (const [xrefId, individual] of file.individuals) {
    lines.push(`0 @${xrefId.replace(/@/g, '')}@ INDI`)
    
    // Names
    for (const name of individual.names) {
      let nameStr = name.full
      if (name.given || name.surname) {
        nameStr = `${name.given} /${name.surname}/`
      }
      lines.push(`1 NAME ${nameStr}`)
      if (name.type) lines.push(`2 TYPE ${name.type}`)
    }
    
    // Sex
    if (individual.sex) {
      lines.push(`1 SEX ${individual.sex}`)
    }
    
    // Families
    for (const famc of individual.familiesAsChild) {
      lines.push(`1 FAMC @${famc.replace(/@/g, '')}@`)
    }
    for (const fams of individual.familiesAsSpouse) {
      lines.push(`1 FAMS @${fams.replace(/@/g, '')}@`)
    }
    
    // Events
    const eventTags: Record<string, GedcomEventType> = {
      birth: 'BIRT',
      baptism: 'BAPM',
      christening: 'CHR',
      death: 'DEAT',
      burial: 'BURI',
      cremation: 'CREM'
    }
    
    for (const [key, tag] of Object.entries(eventTags)) {
      const event = individual[key as keyof GedcomIndividual] as GedcomEvent | undefined
      if (event) {
        lines.push(`1 ${tag}`)
        appendEventDetails(event, 2)
      }
    }
    
    for (const event of individual.events) {
      lines.push(`1 ${event.type}`)
      appendEventDetails(event, 2)
    }
    
    // Notes
    for (const note of individual.notes) {
      lines.push(`1 NOTE ${note}`)
    }
    
    // Sources
    for (const citation of individual.sourceCitations) {
      lines.push(`1 SOUR @${citation.xref.replace(/@/g, '')}@`)
      if (citation.page) lines.push(`2 PAGE ${citation.page}`)
    }
  }
  
  // Families
  for (const [xrefId, family] of file.families) {
    lines.push(`0 @${xrefId.replace(/@/g, '')}@ FAM`)
    
    if (family.husband) {
      lines.push(`1 HUSB @${family.husband.replace(/@/g, '')}@`)
    }
    if (family.wife) {
      lines.push(`1 WIFE @${family.wife.replace(/@/g, '')}@`)
    }
    
    for (const child of family.children) {
      lines.push(`1 CHIL @${child.replace(/@/g, '')}@`)
    }
    
    // Marriage
    if (family.marriage) {
      lines.push(`1 MARR`)
      appendEventDetails(family.marriage, 2)
    }
    if (family.divorce) {
      lines.push(`1 DIV`)
      appendEventDetails(family.divorce, 2)
    }
    for (const engagement of family.engagements || []) {
      lines.push(`1 ENGA`)
      appendEventDetails(engagement, 2)
    }
    
    // Notes
    for (const note of family.notes) {
      lines.push(`1 NOTE ${note}`)
    }
    
    // Sources
    for (const citation of family.sourceCitations || []) {
      lines.push(`1 SOUR @${citation.xref.replace(/@/g, '')}@`)
    }
  }
  
  // Sources
  for (const [xrefId, source] of file.sources) {
    lines.push(`0 @${xrefId.replace(/@/g, '')}@ SOUR`)
    if (source.title) lines.push(`1 TITL ${source.title}`)
    if (source.author) lines.push(`1 AUTH ${source.author}`)
    if (source.publication) lines.push(`1 PUBL ${source.publication}`)
  }
  
  // Trailer
  lines.push(`0 TRLR`)
  
  return lines.join('\n')
}

// Conversion functions
export function convertToAppPerson(individual: GedcomIndividual, file: GedcomFile, generation: number = 0): AppPerson {
  const primaryName = individual.names[0] || { full: 'Unknown', given: 'Unknown', surname: '' }
  const fullName = primaryName.full || `${primaryName.given} ${primaryName.surname}`.trim()
  const shortName = fullName.split(' ')[0] || 'Unknown'
  
  // Calculate lifespan
  let lifespan = ''
  if (individual.birth?.date?.parsed) {
    lifespan += individual.birth.date.parsed.getFullYear().toString()
  }
  if (individual.death?.date?.parsed) {
    if (lifespan) lifespan += ' - '
    lifespan += individual.death.date.parsed.getFullYear().toString()
  }
  
  // Collect all coordinates
  const allCoordinates: [number, number, GedcomEventType][] = []
  
  const addCoordinate = (event?: GedcomEvent) => {
    if (event?.coordinates && !isNaN(event.coordinates[0]) && !isNaN(event.coordinates[1])) {
      allCoordinates.push([event.coordinates[0], event.coordinates[1], event.type])
    }
  }
  
  addCoordinate(individual.birth)
  addCoordinate(individual.baptism)
  addCoordinate(individual.christening)
  addCoordinate(individual.death)
  addCoordinate(individual.burial)
  addCoordinate(individual.cremation)
  
  for (const event of individual.events) {
    addCoordinate(event)
  }
  
  // Get family relationships
  const father: AppPerson | null = null
  const mother: AppPerson | null = null
  const spouses: AppPerson[] = []
  const children: AppPerson[] = []
  const siblings: AppPerson[] = []
  
  // Find father and mother from familiesAsChild
  for (const famc of individual.familiesAsChild) {
    const family = file.families.get(famc)
    if (family) {
      if (family.husband) {
        const dad = file.individuals.get(family.husband)
        if (dad) {
          // Create father AppPerson
        }
      }
      if (family.wife) {
        const mom = file.individuals.get(family.wife)
        if (mom) {
          // Create mother AppPerson
        }
      }
      // Add other children as siblings
      for (const childXref of family.children) {
        if (childXref !== individual.xrefId) {
          const sibling = file.individuals.get(childXref)
          if (sibling) {
            // Add to siblings
          }
        }
      }
    }
  }
  
  return {
    id: individual.xrefId || `person_${Math.random().toString(36).substr(2, 9)}`,
    xrefId: individual.xrefId,
    fullName,
    shortName,
    lifespan,
    sex: individual.sex,
    birth: individual.birth,
    death: individual.death,
    allCoordinates: allCoordinates.length > 0 ? allCoordinates : undefined,
    father,
    mother,
    spouses,
    children,
    siblings,
    generation,
    isRoot: generation === 0,
    expanded: generation <= 2,
    notes: individual.notes.join(' '),
    userData: individual.userData
  }
}

export function convertToMapEvent(person: AppPerson, eventType: GedcomEventType, event?: GedcomEvent): MapEvent {
  const coordinates: LngLat = event?.coordinates && !isNaN(event.coordinates[0]) && !isNaN(event.coordinates[1])
    ? [event.coordinates[0], event.coordinates[1]]
    : [0, 0]
  
  return {
    id: `${person.id}_${eventType}_${Math.random().toString(36).substr(2, 4)}`,
    personId: person.id,
    personName: person.fullName,
    type: eventType,
    date: event?.date?.raw || '',
    place: event?.place || '',
    description: event?.description || '',
    coordinates,
    color: EVENT_COLORS[eventType] || '#9E9E9E',
    icon: EVENT_ICONS[eventType] || '⚪',
    clusterId: person.xrefId || person.id
  }
}

export function convertToFamilyTree(file: GedcomFile, rootXrefId?: string): FamilyTree {
  const people: Map<string, AppPerson> = new Map()
  const families: Map<string, GedcomFamily> = new Map()
  let root: AppPerson
  let generations = 0
  let maxDepth = 0
  
  // Build all AppPersons
  const buildPerson = (individual: GedcomIndividual, generation: number = 0): AppPerson => {
    const primaryName = individual.names[0] || { full: 'Unknown', given: 'Unknown', surname: '' }
    const fullName = primaryName.full || `${primaryName.given} ${primaryName.surname}`.trim()
    const shortName = fullName.split(' ')[0] || 'Unknown'
    
    // Calculate lifespan
    let lifespan = ''
    if (individual.birth?.date?.parsed) {
      lifespan += individual.birth.date.parsed.getFullYear().toString()
    }
    if (individual.death?.date?.parsed) {
      if (lifespan) lifespan += ' - '
      lifespan += individual.death.date.parsed.getFullYear().toString()
    }
    
    // Collect all coordinates
    const allCoordinates: [number, number, GedcomEventType][] = []
    const addCoordinate = (event?: GedcomEvent) => {
      if (event?.coordinates && !isNaN(event.coordinates[0]) && !isNaN(event.coordinates[1])) {
        allCoordinates.push([event.coordinates[0], event.coordinates[1], event.type])
      }
    }
    
    addCoordinate(individual.birth)
    addCoordinate(individual.baptism)
    addCoordinate(individual.death)
    
    for (const event of individual.events) {
      addCoordinate(event)
    }
    
    const person: AppPerson = {
      id: individual.xrefId || `person_${Math.random().toString(36).substr(2, 9)}`,
      xrefId: individual.xrefId,
      fullName,
      shortName,
      lifespan,
      sex: individual.sex,
      birth: individual.birth,
      death: individual.death,
      allCoordinates: allCoordinates.length > 0 ? allCoordinates : undefined,
      father: null,
      mother: null,
      spouses: [],
      children: [],
      siblings: [],
      generation,
      isRoot: false,
      expanded: generation <= 2,
      notes: individual.notes.join(' '),
      userData: individual.userData
    }
    
    people.set(person.id, person)
    return person
  }
  
  // Build relationships
  for (const [xrefId, individual] of file.individuals) {
    const person = buildPerson(individual)
    
    // Find parent families
    for (const famc of individual.familiesAsChild) {
      const family = file.families.get(famc)
      if (family) {
        if (family.husband) {
          const fatherInd = file.individuals.get(family.husband)
          if (fatherInd) {
            const father = buildPerson(fatherInd, person.generation + 1)
            person.father = father
          }
        }
        if (family.wife) {
          const motherInd = file.individuals.get(family.wife)
          if (motherInd) {
            const mother = buildPerson(motherInd, person.generation + 1)
            person.mother = mother
          }
        }
      }
    }
    
    // Find spouse families
    for (const fams of individual.familiesAsSpouse) {
      const family = file.families.get(fams)
      if (family) {
        const spouseXref = family.husband === xrefId ? family.wife : family.husband
        if (spouseXref) {
          const spouseInd = file.individuals.get(spouseXref)
          if (spouseInd) {
            const spouse = buildPerson(spouseInd, person.generation)
            person.spouses.push(spouse)
          }
        }
        
        // Add children
        for (const childXref of family.children) {
          const childInd = file.individuals.get(childXref)
          if (childInd) {
            const child = buildPerson(childInd, person.generation - 1)
            person.children.push(child)
          }
        }
      }
    }
    
    // Find siblings
    for (const famc of individual.familiesAsChild) {
      const family = file.families.get(famc)
      if (family) {
        for (const siblingXref of family.children) {
          if (siblingXref !== xrefId) {
            const siblingInd = file.individuals.get(siblingXref)
            if (siblingInd) {
              const sibling = buildPerson(siblingInd, person.generation)
              person.siblings.push(sibling)
            }
          }
        }
      }
    }
  }
  
  // Set root
  if (rootXrefId) {
    const rootInd = file.individuals.get(rootXrefId)
    if (rootInd) {
      root = buildPerson(rootInd, 0)
      root.isRoot = true
    } else {
      // Pick first individual as root
      const firstInd = file.individuals.values().next().value
      if (firstInd) {
        root = buildPerson(firstInd, 0)
        root.isRoot = true
      } else {
        throw new Error('No individuals found in GEDCOM file')
      }
    }
  } else {
    // Pick first individual as root
    const firstInd = file.individuals.values().next().value
    if (firstInd) {
      root = buildPerson(firstInd, 0)
      root.isRoot = true
    } else {
      throw new Error('No individuals found in GEDCOM file')
    }
  }
  
  // Copy all families
  for (const [xrefId, family] of file.families) {
    families.set(xrefId, family)
  }
  
  // Calculate tree metadata
  let minDate: Date | undefined
  let maxDate: Date | undefined
  let minLat: number | undefined
  let maxLat: number | undefined
  let minLng: number | undefined
  let maxLng: number | undefined
  
  for (const person of people.values()) {
    if (person.birth?.date?.parsed) {
      if (!minDate || person.birth.date.parsed < minDate) minDate = person.birth.date.parsed
      if (!maxDate || person.birth.date.parsed > maxDate) maxDate = person.birth.date.parsed
    }
    if (person.death?.date?.parsed) {
      if (!minDate || person.death.date.parsed < minDate) minDate = person.death.date.parsed
      if (!maxDate || person.death.date.parsed > maxDate) maxDate = person.death.date.parsed
    }
    
    if (person.allCoordinates) {
      for (const [lat, lng] of person.allCoordinates) {
        if (!minLat || lat < minLat) minLat = lat
        if (!maxLat || lat > maxLat) maxLat = lat
        if (!minLng || lng < minLng) minLng = lng
        if (!maxLng || lng > maxLng) maxLng = lng
      }
    }
  }
  
  return {
    root,
    people,
    families,
    generations,
    depth: maxDepth,
    bounds: { minDate, maxDate, minLat, maxLat, minLng, maxLng }
  }
}

// Simple conversion for MapEvent creation
export function createMapEventsFromFile(file: GedcomFile): MapEvent[] {
  const events: MapEvent[] = []
  
  for (const [xrefId, individual] of file.individuals) {
    const primaryName = individual.names[0] || { full: 'Unknown', given: 'Unknown', surname: '' }
    const fullName = primaryName.full || `${primaryName.given} ${primaryName.surname}`.trim()
    
    // Process known event types
    const eventTypes: { key: keyof GedcomIndividual; type: GedcomEventType }[] = [
      { key: 'birth', type: 'BIRT' },
      { key: 'baptism', type: 'BAPM' },
      { key: 'christening', type: 'CHR' },
      { key: 'death', type: 'DEAT' },
      { key: 'burial', type: 'BURI' },
      { key: 'cremation', type: 'CREM' }
    ]
    
    for (const { key, type } of eventTypes) {
      const event = individual[key] as GedcomEvent | undefined
      if (event?.coordinates && !isNaN(event.coordinates[0]) && !isNaN(event.coordinates[1])) {
        const coordinates: LngLat = [event.coordinates[0], event.coordinates[1]]
        
        events.push({
          id: `${xrefId}_${type}`,
          personId: xrefId,
          personName: fullName,
          type,
          date: event.date?.raw || '',
          place: event.place || '',
          description: '',
          coordinates,
          color: EVENT_COLORS[type] || '#9E9E9E',
          icon: EVENT_ICONS[type] || '⚪',
          clusterId: xrefId
        })
      }
    }
    
    // Process custom events
    for (const event of individual.events) {
      if (event.coordinates && !isNaN(event.coordinates[0]) && !isNaN(event.coordinates[1])) {
        const coordinates: LngLat = [event.coordinates[0], event.coordinates[1]]
        
        events.push({
          id: `${xrefId}_${event.type}_${events.length}`,
          personId: xrefId,
          personName: fullName,
          type: event.type,
          date: event.date?.raw || '',
          place: event.place || '',
          description: event.description || '',
          coordinates,
          color: EVENT_COLORS[event.type] || '#9E9E9E',
          icon: EVENT_ICONS[event.type] || '⚪',
          clusterId: xrefId
        })
      }
    }
  }

  for (const family of file.families.values()) {
    const event = family.marriage
    const personId = family.husband || family.wife
    const person = personId ? file.individuals.get(personId) : undefined
    if (!event?.coordinates || !personId || !person) continue
    const spouseId = family.husband === personId ? family.wife : family.husband
    const spouseName = spouseId ? file.individuals.get(spouseId)?.names[0]?.full : undefined
    events.push({
      id: `${family.xrefId}_MARR`,
      personId,
      personName: spouseName ? `${person.names[0]?.full || personId} & ${spouseName}` : person.names[0]?.full || personId,
      type: 'MARR',
      date: event.date?.raw || '',
      place: event.place || '',
      description: 'Marriage',
      coordinates: [event.coordinates[0], event.coordinates[1]],
      color: EVENT_COLORS.MARR,
      icon: EVENT_ICONS.MARR,
      clusterId: family.xrefId,
    })
  }
  
  return events
}

export {
  GedcomParser,
  DEFAULT_OPTIONS,
  MONTHS,
  CZECH_MONTHS,
  EVENT_TYPES,
  EVENT_COLORS,
  EVENT_ICONS
}
