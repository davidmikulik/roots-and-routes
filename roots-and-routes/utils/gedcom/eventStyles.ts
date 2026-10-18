// Colour, icon and category of each event type: map markers (EventMap.client.vue) and the person detail
// (PersonDetail.vue) on every page
export type EventCategory = 'birth' | 'marriage' | 'death' | 'other'
export interface EventStyle { color: string; icon: string; category: EventCategory }

export const EVENT_STYLES: Record<string, EventStyle> = {
  BIRT: { color: '#22c55e', icon: '👶', category: 'birth' },
  CHR: { color: '#22c55e', icon: '👶', category: 'birth' },
  BAPM: { color: '#22c55e', icon: '👶', category: 'birth' },
  DEAT: { color: '#ef4444', icon: '⚰️', category: 'death' },
  BURI: { color: '#ef4444', icon: '⚰️', category: 'death' },
  CREM: { color: '#ef4444', icon: '⚰️', category: 'death' },
  MARR: { color: '#3b82f6', icon: '💍', category: 'marriage' },
  DIV: { color: '#9333ea', icon: '💔', category: 'marriage' },
  ENGA: { color: '#3b82f6', icon: '💍', category: 'marriage' },
  CENS: { color: '#f59e0b', icon: '📄', category: 'other' },
  RESI: { color: '#06b6d4', icon: '🏠', category: 'other' },
  OCCU: { color: '#64748b', icon: '💼', category: 'other' },
  EDUC: { color: '#8b5cf6', icon: '🎓', category: 'other' },
  EMIG: { color: '#10b981', icon: '✈️', category: 'other' },
  IMMI: { color: '#10b981', icon: '✈️', category: 'other' },
  MILI: { color: '#ea580c', icon: '🎖️', category: 'other' },
  RELI: { color: '#8b5cf6', icon: '⛪', category: 'other' },
  EVEN: { color: '#9ca3af', icon: '⚪', category: 'other' },
  FACT: { color: '#9ca3af', icon: '⚪', category: 'other' },
}

export const eventStyle = (type: string): EventStyle => EVENT_STYLES[type] ?? { color: '#9ca3af', icon: '⚪', category: 'other' }
