// Release notes (utils/releaseNotes.ts) in the current language. Shown in Settings → About (the current version) and
// on /release-notes (all versions, linked from About).
import { LATEST_RELEASE, RELEASE_NOTES, type Release } from '~~/utils/releaseNotes'
import { useSettings } from '~~/composables/useSettings'

export const useReleaseNotes = () => {
  const { settings } = useSettings()
  const language = computed(() => (settings.value.language === 'cs' ? 'cs' : 'en'))
  const locale = computed(() => (language.value === 'cs' ? 'cs-CZ' : 'en-GB'))

  const formatDate = (iso: string): string =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  const titleOf = (release: Release): string => release.title[language.value]
  const textOf = (item: Release['items'][number]): string => item[language.value]

  return { releases: RELEASE_NOTES, latest: LATEST_RELEASE, formatDate, titleOf, textOf }
}
