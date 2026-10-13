import { useSettings } from '~~/composables/useSettings'
import { useAdminAuth } from '~~/composables/useAdminAuth'

// Anonymous mode: display-only masking of personal information (names → initials, dates → year, places hidden).
// Always on for visitors who are not logged in as administrator; the administrator can switch it off in the settings.
// Logged-out is also the state during prerender and before the saved token is restored, so nothing leaks while loading.
export const useAnonymize = () => {
  const { settings } = useSettings()
  const adminAuth = useAdminAuth()
  const enabled = computed(() => !adminAuth.isAdmin.value || settings.value.privacy.anonymousMode)

  const name = (value: string): string => {
    if (!enabled.value) return value
    const initials = value.replace(/[/]/g, ' ').split(/\s+/).filter(Boolean).map(part => `${part[0]!.toUpperCase()}.`).join(' ')
    return initials || '?'
  }
  const date = (value = ''): string => (enabled.value ? value.match(/\b\d{4}\b/)?.[0] || '' : value)
  const place = (value = ''): string => (enabled.value ? '' : value)

  return { enabled, name, date, place }
}
