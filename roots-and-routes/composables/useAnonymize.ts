import { useSettings } from '~~/composables/useSettings'

// Anonymous mode: display-only masking of personal information (names → initials, dates → year, places hidden)
export const useAnonymize = () => {
  const { settings } = useSettings()
  const enabled = computed(() => settings.value.privacy.anonymousMode)

  const name = (value: string): string => {
    if (!enabled.value) return value
    const initials = value.replace(/[/]/g, ' ').split(/\s+/).filter(Boolean).map(part => `${part[0]!.toUpperCase()}.`).join(' ')
    return initials || '?'
  }
  const date = (value = ''): string => (enabled.value ? value.match(/\b\d{4}\b/)?.[0] || '' : value)
  const place = (value = ''): string => (enabled.value ? '' : value)

  return { enabled, name, date, place }
}
