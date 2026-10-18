// Release notes (utils/releaseNotes.ts) in the current language, and whether this browser has seen the latest release
// (a "new" badge on the home page until the release notes page is opened). The last seen version lives in
// localStorage, so it is read only in the browser after mount.
import { LATEST_RELEASE, RELEASE_NOTES, type Release } from '~~/utils/releaseNotes'
import { useSettings } from '~~/composables/useSettings'

const SEEN_KEY = 'roots-and-routes-seen-release'

export const useReleaseNotes = () => {
  const { settings } = useSettings()
  const language = computed(() => (settings.value.language === 'cs' ? 'cs' : 'en'))
  const locale = computed(() => (language.value === 'cs' ? 'cs-CZ' : 'en-GB'))
  const seenVersion = useState<string | null>('release-notes-seen', () => null)

  const formatDate = (iso: string): string =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale.value, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  const titleOf = (release: Release): string => release.title[language.value]
  const textOf = (item: Release['items'][number]): string => item[language.value]

  // Call in onMounted
  const restoreSeen = () => {
    try { seenVersion.value = localStorage.getItem(SEEN_KEY) ?? '' } catch { seenVersion.value = '' }
  }
  const markSeen = () => {
    seenVersion.value = LATEST_RELEASE.version
    try { localStorage.setItem(SEEN_KEY, LATEST_RELEASE.version) } catch { /* private mode: the badge just stays */ }
  }
  // Unknown until mounted (null), so the badge never flashes during prerender or hydration
  const hasUnseen = computed(() => seenVersion.value !== null && seenVersion.value !== LATEST_RELEASE.version)

  return { releases: RELEASE_NOTES, latest: LATEST_RELEASE, formatDate, titleOf, textOf, restoreSeen, markSeen, hasUnseen }
}
