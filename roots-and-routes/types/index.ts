// Main Type Definitions
export * from './gedcom'

import type { GedcomFile, GedcomEventType, AppPerson, MapEvent, FamilyTree, GedcomParseResult } from './gedcom'

// API Types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: ApiError
  message?: string
  warnings?: string[]
  timestamp: string
  version: string
}

export interface ApiError {
  code: string
  message: string
  details?: string
  timestamp: string
  path?: string
  method?: string
  statusCode: number
}

// Storage Types
export interface UploadedFile {
  id: string
  name: string
  originalName: string
  size: number
  mimeType: string
  extension: string
  path: string
  url: string
  createdAt: Date
  updatedAt: Date
  uploadedBy?: string
  status: 'uploading' | 'processing' | 'ready' | 'error'
}

// Utility Functions
export function isGedcomFile(obj: any): obj is GedcomFile {
  return obj && typeof obj.version === 'string' && obj.individuals instanceof Map && obj.families instanceof Map
}

export function isAppPerson(obj: any): obj is AppPerson {
  return obj && typeof obj.id === 'string' && typeof obj.fullName === 'string' && (obj.sex === 'M' || obj.sex === 'F' || obj.sex === '')
}
