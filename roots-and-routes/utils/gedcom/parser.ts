// Custom GEDCOM Parser - Complete implementation
import type { LatLngTuple as LngLat } from 'leaflet'
import { parseGedcomName, nameToGedcom, stripSurnameSlashes, formatPersonName } from './names'
import { EVENT_TYPES, type ExtraTag } from './eventTypes'
import type {
  GedcomFile, GedcomLine, GedcomIndividual, GedcomFamily, GedcomName,
  GedcomEvent, GedcomDate, GedcomSource, GedcomSourceCitation, GedcomRepository,
  GedcomMultimedia, GedcomNote, GedcomMetadata, GedcomParseResult,
  GedcomParseOptions, GedcomEventType, AppPerson, MapEvent, FamilyTree,
  GedcomCalendar, GedcomConfidenceLevel, GedcomAddress, GedcomAssociation, GedcomSourceParticipant
} from '~~/types/gedcom'
import { normalizeSourceRole } from './sourceRoles'

// Constants
const DEFAULT_OPTIONS: GedcomParseOptions = { maxLines: 0, resolveXrefs: true, extractCoordinates: false }
const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
const CZECH_MONTHS: Record<string, number> = { LEDEN: 0, ÚNOR: 1, BŘEZEN: 2, DUBEN: 3, KVĚTEN: 4, ČERVEN: 5, ČERVENEC: 6, SRPEN: 7, ZÁŘÍ: 8, ŘÍJEN: 9, LISTOPAD: 10, PROSINEC: 11 }
const RECORD_TAGS = ['INDI', 'FAM', 'SOUR', 'REPO', 'NOTE', 'OBJE', 'SUBM', 'HEAD', 'TRLR']
const normalizeXref = (value: string): string => value.replace(/^@|@$/g, '')


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
  // Inside an unknown level-1 tag of a person (e.g. CHAN with its DATE): its sub-lines are skipped
  private inUnknownIndividualTag = false
  // The NAME record being read: its sub-lines (TYPE, GIVN, SURN, _MARNM…) belong to it
  private currentName: GedcomName | null = null
  private currentNamePerson: GedcomIndividual | null = null
  // Right after "1 SEX": its "2 OBJE" lines are the sources of the sex
  private currentSexPerson: GedcomIndividual | null = null
  // The citation being read ("n SOUR @S1@"): lines below it (PAGE, QUAY, DATA/TEXT, NOTE) belong to it
  private currentCitation: GedcomSourceCitation | null = null
  private currentCitationLevel = 0
  // Inside "DATA" of the citation (its TEXT), and the last text field for CONT/CONC lines
  private citationField: 'page' | 'text' | 'notes' | null = null
  // The association being read ("1 ASSO @I2@" with "2 RELA")
  private currentAssociation: GedcomAssociation | null = null
  // Source record: the last text field (CONT/CONC lines continue it) and the participant being read
  private sourceField: 'title' | 'author' | 'publication' | 'text' | 'note' | null = null
  private currentParticipant: GedcomSourceParticipant | null = null
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
        this.currentName = null
        this.currentCitation = null
        this.currentAssociation = null
        this.sourceField = null
        this.currentParticipant = null
        
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

    if (this.continueCitation(line)) return
    if (line.level > 1 && this.currentIndividualEvent) {
      this.processEventDetail(line, this.currentIndividualEvent)
      return
    }
    if (line.level > 1 && this.inUnknownIndividualTag) return
    if (line.level === 2 && this.currentName && this.currentNamePerson === individual && this.processNameDetail(tag, value, individual)) return
    // Sources of the sex ("2 OBJE" or "2 SOUR" under SEX); other lines under SEX are ignored
    if (line.level > 1 && this.currentSexPerson === individual) {
      if (line.level === 2 && tag === 'OBJE' && value) (individual.sexLinks ||= []).push(normalizeXref(value))
      if (line.level === 2 && tag === 'SOUR' && value) this.startCitation((individual.sexCitations ||= []), value, line.level)
      return
    }
    // "2 RELA" and "2 SOUR" of an association
    if (line.level > 1 && this.currentAssociation) {
      if (line.level === 2 && tag === 'RELA') this.currentAssociation.relationship = value
      else if (line.level === 2 && tag === 'SOUR' && value) this.startCitation((this.currentAssociation.sourceCitations ||= []), value, line.level)
      else if (line.level === 2 && tag === 'NOTE') this.currentAssociation.description = value
      return
    }

    this.currentIndividualEvent = null
    this.inUnknownIndividualTag = false
    this.currentSexPerson = null
    this.currentAssociation = null
    if (line.level === 1) this.currentName = null
    
    switch (tag) {
      case 'NAME': {
        const name = this.parseName(value)
        individual.names.push(name)
        this.currentName = name
        this.currentNamePerson = individual
        break
      }
      case 'SEX':
        individual.sex = value === 'M' ? 'M' : value === 'F' ? 'F' : ''
        if (line.level === 1) this.currentSexPerson = individual
        break
      case '_LIVING':
        individual.living = value.trim().toUpperCase() !== 'N'
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
        if (value) this.startCitation(individual.sourceCitations, value, line.level)
        break
      case 'OBJE':
        if (value) individual.multimediaLinks.push(normalizeXref(value))
        break
      case 'ASSO':
        if (!value) break
        this.currentAssociation = { individualXref: normalizeXref(value), relationship: '' }
        individual.associations.push(this.currentAssociation)
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
          // Not an event (MyHeritage writes _UPD, _UID and RIN for every person): kept as it is and written back
          const extraTags: ExtraTag[] = individual.userData.extraTags ||= []
          extraTags.push({ tag: line.tag, value })
          this.inUnknownIndividualTag = true
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

    if (this.continueCitation(line)) return
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
        if (value) this.startCitation((family.sourceCitations ||= []), value, line.level)
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

  // Sub-lines of an event (the event is on level 1). DATE, PLAC, NOTE… count only directly under the event: deeper
  // lines belong to something else, e.g. "2 SOUR" with "3 DATA / 4 DATE" (the date of the source, not of the event).
  // Coordinates sit deeper (2 PLAC / 3 MAP / 4 LATI). Other tags (MyHeritage's _UID, RIN, _UPD…) are ignored.
  private processEventDetail(line: GedcomLine, event: GedcomEvent) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    if (line.level !== 2 && tag !== 'LATI' && tag !== 'LONG') return
    if (tag === 'DATE') event.date = this.parseDate(value)
    // Sources of the event: a link or attachment (OBJE record) or a citation of a SOUR record (its PAGE, QUAY… are
    // read by continueCitation)
    else if (tag === 'OBJE' && value) (event.multimediaLinks ||= []).push(normalizeXref(value))
    else if (tag === 'SOUR' && value) this.startCitation((event.sourceCitations ||= []), value, line.level)
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

  // A citation of a source record at `level`; its sub-lines are read by continueCitation
  private startCitation(list: GedcomSourceCitation[], value: string, level: number) {
    const citation: GedcomSourceCitation = { xref: normalizeXref(value) }
    list.push(citation)
    this.currentCitation = citation
    this.currentCitationLevel = level
    this.citationField = null
  }

  // Lines below a citation: PAGE, QUAY, DATA / TEXT (the entry), NOTE, with CONT/CONC. Returns false (and ends the
  // citation) for a line that is not below it.
  private continueCitation(line: GedcomLine): boolean {
    const citation = this.currentCitation
    if (!citation) return false
    if (line.level <= this.currentCitationLevel) {
      this.currentCitation = null
      return false
    }
    const tag = line.tag.toUpperCase()
    const value = line.value
    const depth = line.level - this.currentCitationLevel
    if ((tag === 'CONT' || tag === 'CONC') && this.citationField) {
      const glue = tag === 'CONT' ? '\n' : ''
      citation[this.citationField] = `${citation[this.citationField] || ''}${glue}${value}`
      return true
    }
    this.citationField = null
    if (depth === 1 && tag === 'PAGE') { citation.page = value; this.citationField = 'page' }
    else if (depth === 1 && tag === 'QUAY') {
      const quality = Number(value)
      if ([0, 1, 2, 3].includes(quality) && value.trim() !== '') citation.confidence = quality as GedcomConfidenceLevel
    }
    else if (depth === 1 && tag === 'NOTE') { citation.notes = value; this.citationField = 'notes' }
    else if (depth === 2 && tag === 'TEXT') { citation.text = value; this.citationField = 'text' }
    return true
  }

  private processSourceLine(line: GedcomLine, source: GedcomSource) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId

    // Continuation of a multi-line text (transcript, translation, title…)
    if (line.level === 2 && (tag === 'CONT' || tag === 'CONC') && this.sourceField) {
      const glue = tag === 'CONT' ? '\n' : ''
      if (this.sourceField === 'note') source.notes[source.notes.length - 1] += `${glue}${value}`
      else source[this.sourceField] = `${source[this.sourceField] || ''}${glue}${value}`
      return
    }
    // Sub-lines of a participant (_PART)
    if (line.level === 2 && this.currentParticipant) {
      if (tag === 'ROLE') this.currentParticipant.role = normalizeSourceRole(value)
      else if (tag === 'AGE') this.currentParticipant.age = value
      else if (tag === 'NOTE') this.currentParticipant.note = value
      return
    }
    if (line.level > 1) return
    this.sourceField = null
    this.currentParticipant = null

    switch (tag) {
      case 'TITL':
        source.title = value
        this.sourceField = 'title'
        break
      case 'AUTH':
        source.author = value
        this.sourceField = 'author'
        break
      case 'PUBL':
        source.publication = value
        this.sourceField = 'publication'
        break
      case 'REPO':
        source.repository = normalizeXref(value)
        break
      case 'TEXT':
        source.text = value
        this.sourceField = 'text'
        break
      case 'TYPE':
        source.type = value
        break
      case 'NOTE':
        if (xrefId) source.notes.push(xrefId)
        else { source.notes.push(value); this.sourceField = 'note' }
        break
      case 'OBJE':
        if (value) source.multimediaLinks.push(normalizeXref(value))
        break
      case '_LANG':
        if (value) source.language = value.trim()
        break
      case '_VERIFIED_BY':
        if (value) source.verifiedBy = value.trim()
        break
      case '_VERIFIED_AT':
        if (value) source.verifiedAt = value.trim()
        break
      case '_PART':
        if (!value) break
        this.currentParticipant = { person: normalizeXref(value), role: 'other' }
        ;(source.participants ||= []).push(this.currentParticipant)
        break
      default: {
        // Kept as it is and written back (CHAN, RIN, _UID…; their sub-lines are dropped)
        const extraTags: ExtraTag[] = source.userData.extraTags ||= []
        extraTags.push({ tag: line.tag, value })
      }
    }
  }

  private processRepositoryLine(line: GedcomLine, repository: GedcomRepository) {
    const tag = line.tag.toUpperCase()
    const value = line.value
    const xrefId = line.xrefId
    // Parts of the address ("1 ADDR" / "2 CITY"…)
    if (line.level === 2 && ['ADR1', 'ADR2', 'CITY', 'STAE', 'POST', 'CTRY'].includes(tag)) {
      repository.address = this.parseAddress(line, repository.address || {})
      return
    }
    if (line.level > 1) return

    switch (tag) {
      case 'NAME':
        repository.name = value
        break
      case 'ADDR':
        repository.address = repository.address || {}
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
      // Our own tag: the original address of a file copied into the tree (FILE then points to the copy)
      case '_URL':
        multimedia.url = value
        break
      case 'NOTE':
        if (xrefId) multimedia.notes.push(xrefId)
        else if (value) multimedia.notes.push(value)
        break
    }
  }

  // `full` is stored without the surname slashes; see utils/gedcom/names.ts
  private parseName(nameString: string): GedcomName {
    return parseGedcomName(nameString)
  }

  // A sub-line of NAME. TYPE says what kind of name it is (birth, married…); _MARNM (MyHeritage) is the married
  // surname, which becomes a separate married name. Returns false for lines that are not about the name (e.g. a
  // NOTE or SOUR, handled as before).
  private processNameDetail(tag: string, value: string, individual: GedcomIndividual): boolean {
    const name = this.currentName!
    switch (tag) {
      case 'TYPE':
        if (value) name.type = value.trim().toLowerCase()
        return true
      case 'GIVN':
        if (!name.given && value) { name.given = value.trim(); if (!name.full) name.full = [name.given, name.surname].filter(Boolean).join(' ') }
        return true
      case 'SURN':
        if (!name.surname && value) { name.surname = value.trim(); if (!name.full) name.full = [name.given, name.surname].filter(Boolean).join(' ') }
        return true
      case 'NPFX':
        if (value) name.prefix = value.trim()
        return true
      case 'NSFX':
        if (value && !name.suffix) name.suffix = value.trim()
        return true
      case 'NICK':
        if (value) name.nickname = value.trim()
        return true
      // A source of the name (a link or attachment of the person)
      case 'OBJE':
        if (value) (name.multimediaLinks ||= []).push(normalizeXref(value))
        return true
      case 'SOUR':
        if (value) this.startCitation((name.sourceCitations ||= []), value, 2)
        return true
      case '_MARNM': {
        const surname = stripSurnameSlashes(value || '')
        if (!surname || individual.names.some(existing => existing.type === 'married' && existing.surname === surname)) return true
        individual.names.push({ full: [name.given, surname].filter(Boolean).join(' '), given: name.given, surname, type: 'married' })
        return true
      }
      default:
        return false
    }
  }

  // The value on the event line is not a date: "Y" for an event that happened, or the descriptor of an attribute
  // ("1 OCCU Programmer"); the date comes in a DATE sub-line
  private createEvent(type: GedcomEventType, value: string): GedcomEvent {
    return {
      type,
      place: '',
      description: value && value !== 'Y' ? value : '',
    }
  }

  // The same reading of a date as in the import, for dates typed in the editor (parseGedcomDate below)
  readDate(dateString: string): GedcomDate | undefined {
    return this.parseDate(dateString.trim().replace(/\s+/g, ' '))
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
/** A GEDCOM date text ("ABT MAR 1850") as GedcomDate, read like the import does; undefined for an empty text */
export function parseGedcomDate(text: string): GedcomDate | undefined {
  return new GedcomParser().readDate(text)
}

export function parseGedcom(content: string, options?: GedcomParseOptions): GedcomParseResult {
  const parser = new GedcomParser(options)
  return parser.parse(content)
}

// Write GEDCOM function
export function writeGedcom(file: GedcomFile, options?: { version?: '5.5' | '7.0'; encoding?: string }): string {
  const lines: string[] = []
  const version = options?.version || '5.5'
  const encoding = options?.encoding || 'UTF-8'
  const pointer = (xref: string) => `@${xref.replace(/@/g, '')}@`
  // A text that may have several lines: the first on the tag's line, the others as CONT lines below it
  const appendText = (level: number, tag: string, text?: string) => {
    if (text === undefined || text === null) return
    const [first, ...rest] = String(text).replace(/\r\n?/g, '\n').split('\n')
    lines.push(first ? `${level} ${tag} ${first}` : `${level} ${tag}`)
    for (const line of rest) lines.push(line ? `${level + 1} CONT ${line}` : `${level + 1} CONT`)
  }
  // A citation of a source record with its page, the text of the entry, the confidence (QUAY) and a note
  const appendCitation = (citation: GedcomSourceCitation, level: number) => {
    lines.push(`${level} SOUR ${pointer(citation.xref)}`)
    if (citation.page) appendText(level + 1, 'PAGE', citation.page)
    if (citation.text) {
      lines.push(`${level + 1} DATA`)
      appendText(level + 2, 'TEXT', citation.text)
    }
    if (citation.confidence !== undefined && citation.confidence !== null) lines.push(`${level + 1} QUAY ${citation.confidence}`)
    if (citation.notes) appendText(level + 1, 'NOTE', citation.notes)
  }
  // Sources of a fact: citations of SOUR records and links or attachments (OBJE records)
  const appendSources = (event: { sourceCitations?: GedcomSourceCitation[]; multimediaLinks?: string[] }, level: number) => {
    for (const citation of event.sourceCitations || []) appendCitation(citation, level)
    for (const media of event.multimediaLinks || []) lines.push(`${level} OBJE ${pointer(media)}`)
  }
  // An event line with its details; without any detail "1 DEAT Y" (the event happened, nothing more is known)
  const appendEvent = (tag: string, event: GedcomEvent, level: number) => {
    const start = lines.push(`${level} ${tag}`)
    appendEventDetails(event, level + 1)
    if (lines.length === start) lines[start - 1] = `${level} ${tag} Y`
  }
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
    appendSources(event, level)
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
      lines.push(`1 NAME ${nameToGedcom(name)}`)
      if (name.type) lines.push(`2 TYPE ${name.type}`)
      appendSources(name, 2)
    }
    
    // Sex
    if (individual.sex) {
      lines.push(`1 SEX ${individual.sex}`)
      appendSources({ sourceCitations: individual.sexCitations, multimediaLinks: individual.sexLinks }, 2)
    }
    // Living (our own tag); a death event says deceased
    if (individual.living && !individual.death) lines.push('1 _LIVING Y')
    
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
      if (event) appendEvent(tag, event, 1)
    }
    
    for (const event of individual.events) appendEvent(event.type, event, 1)
    
    // Notes
    for (const note of individual.notes) {
      lines.push(`1 NOTE ${note}`)
    }
    
    // Tags that are not events (MyHeritage's _UPD, _UID, RIN, …), unchanged
    for (const extra of (individual.userData?.extraTags || []) as ExtraTag[]) {
      lines.push(extra.value ? `1 ${extra.tag} ${extra.value}` : `1 ${extra.tag}`)
    }

    // Associations (godparents, witnesses…), with the source they come from
    for (const association of individual.associations || []) {
      if (!association.individualXref) continue
      lines.push(`1 ASSO ${pointer(association.individualXref)}`)
      if (association.relationship) lines.push(`2 RELA ${association.relationship}`)
      if (association.description) lines.push(`2 NOTE ${association.description}`)
      for (const citation of association.sourceCitations || []) appendCitation(citation, 2)
    }

    // Sources
    for (const citation of individual.sourceCitations) appendCitation(citation, 1)

    // Links, images and documents (OBJE records below)
    for (const media of individual.multimediaLinks) {
      lines.push(`1 OBJE @${media.replace(/@/g, '')}@`)
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
    if (family.marriage) appendEvent('MARR', family.marriage, 1)
    if (family.divorce) appendEvent('DIV', family.divorce, 1)
    for (const engagement of family.engagements || []) appendEvent('ENGA', engagement, 1)
    
    // Notes
    for (const note of family.notes) {
      lines.push(`1 NOTE ${note}`)
    }
    
    // Sources
    for (const citation of family.sourceCitations || []) appendCitation(citation, 1)

    for (const media of family.multimediaLinks || []) {
      lines.push(`1 OBJE @${media.replace(/@/g, '')}@`)
    }
  }
  
  // Sources
  // Sources: title, author, book (PUBL), archive (REPO), transcript (TEXT), translation and notes (NOTE), links and
  // images (OBJE); our own tags for the language, the check and the people in the record with their roles
  for (const [xrefId, source] of file.sources) {
    lines.push(`0 @${xrefId.replace(/@/g, '')}@ SOUR`)
    if (source.title) appendText(1, 'TITL', source.title)
    if (source.author) appendText(1, 'AUTH', source.author)
    if (source.publication) appendText(1, 'PUBL', source.publication)
    if (source.type) lines.push(`1 TYPE ${source.type}`)
    if (source.repository) lines.push(`1 REPO ${file.repositories.has(source.repository) ? pointer(source.repository) : source.repository}`)
    if (source.text) appendText(1, 'TEXT', source.text)
    for (const note of source.notes || []) if (note) appendText(1, 'NOTE', note)
    for (const media of source.multimediaLinks || []) lines.push(`1 OBJE ${pointer(media)}`)
    if (source.language) lines.push(`1 _LANG ${source.language}`)
    if (source.verifiedBy) lines.push(`1 _VERIFIED_BY ${source.verifiedBy}`)
    if (source.verifiedAt) lines.push(`1 _VERIFIED_AT ${source.verifiedAt}`)
    for (const participant of source.participants || []) {
      lines.push(`1 _PART ${pointer(participant.person)}`)
      lines.push(`2 ROLE ${participant.role}`)
      if (participant.age) lines.push(`2 AGE ${participant.age}`)
      if (participant.note) lines.push(`2 NOTE ${participant.note.replace(/\s*[\r\n]+\s*/g, ' ')}`)
    }
    for (const extra of (source.userData?.extraTags || []) as ExtraTag[]) lines.push(extra.value ? `1 ${extra.tag} ${extra.value}` : `1 ${extra.tag}`)
  }

  // Repositories (archives)
  for (const [xrefId, repository] of file.repositories) {
    lines.push(`0 @${xrefId.replace(/@/g, '')}@ REPO`)
    if (repository.name) lines.push(`1 NAME ${repository.name}`)
    const address = repository.address
    if (address && Object.values(address).some(Boolean)) {
      lines.push(`1 ADDR ${address.line1 || ''}`.trimEnd())
      if (address.line1) lines.push(`2 ADR1 ${address.line1}`)
      if (address.line2) lines.push(`2 ADR2 ${address.line2}`)
      if (address.city) lines.push(`2 CITY ${address.city}`)
      if (address.state) lines.push(`2 STAE ${address.state}`)
      if (address.postalCode) lines.push(`2 POST ${address.postalCode}`)
      if (address.country) lines.push(`2 CTRY ${address.country}`)
    }
    for (const phone of repository.phone || []) lines.push(`1 PHON ${phone}`)
    for (const email of repository.email || []) lines.push(`1 EMAIL ${email}`)
    for (const web of repository.web || []) lines.push(`1 WWW ${web}`)
    for (const note of repository.notes || []) if (note) appendText(1, 'NOTE', note)
  }

  // Multimedia (GEDCOM 5.5.1 layout: FORM and TITL under FILE). FILE is a web address, or media/<name> for a copy
  // stored in the tree; the original address of a copy goes to our own _URL tag
  const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  for (const [xrefId, media] of file.multimedia) {
    lines.push(`0 @${xrefId.replace(/@/g, '')}@ OBJE`)
    if (media.file) {
      lines.push(`1 FILE ${oneLine(media.file)}`)
      if (media.format) lines.push(`2 FORM ${oneLine(media.format)}`)
      if (media.title) lines.push(`2 TITL ${oneLine(media.title)}`)
    }
    if (media.url && media.url !== media.file) lines.push(`1 _URL ${oneLine(media.url)}`)
    for (const note of media.notes) lines.push(`1 NOTE ${oneLine(note)}`)
  }
  
  // Trailer
  lines.push(`0 TRLR`)
  
  return lines.join('\n')
}

// Conversion functions
export function convertToAppPerson(individual: GedcomIndividual, file: GedcomFile, generation: number = 0): AppPerson {
  // Married name with the birth surname when recorded (utils/gedcom/names.ts)
  const fullName = formatPersonName(individual.names) || 'Unknown'
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
    names: individual.names,
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
    // Married name with the birth surname when recorded (utils/gedcom/names.ts)
    const fullName = formatPersonName(individual.names) || 'Unknown'
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
      names: individual.names,
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
    // Married name with the birth surname when recorded (utils/gedcom/names.ts)
    const fullName = formatPersonName(individual.names) || 'Unknown'
    
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
          cause: event.cause,
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
          cause: event.cause,
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
    const spouse = spouseId ? file.individuals.get(spouseId) : undefined
    const spouseName = spouse ? formatPersonName(spouse.names) : undefined
    events.push({
      id: `${family.xrefId}_MARR`,
      personId,
      personName: spouseName ? `${formatPersonName(person.names) || personId} & ${spouseName}` : formatPersonName(person.names) || personId,
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
