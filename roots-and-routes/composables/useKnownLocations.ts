// The catalog of known locations (Admin → Known locations) on the client, for showing the archive maps of a place.
// Only for the administrator: GET /api/admin/locations needs the admin token. Loaded once and shared through useState;
// the Known locations page puts its list here after loading, saving or syncing.
import type { KnownLocation } from '~~/types/locations'
import { useAdminAuth } from '~~/composables/useAdminAuth'
import { normalizeLocationName } from '~~/utils/gedcom/locations'
import { parseArchiveMapUrl, type ParsedArchiveMap } from '~~/utils/gedcom/archiveMaps'

export const useKnownLocations = () => {
  const adminAuth = useAdminAuth()
  const locations = useState<KnownLocation[] | null>('known-locations', () => null)

  const load = async (force = false): Promise<void> => {
    if (!import.meta.client || !adminAuth.isAdmin.value || (locations.value && !force)) return
    try {
      locations.value = (await $fetch<{ locations: KnownLocation[] }>('/api/admin/locations', { headers: adminAuth.authHeaders() })).locations
    } catch (error) {
      console.error('[LOCATIONS] Known locations could not be loaded:', error)
    }
  }

  // Pages call this in setup: loads as soon as the admin token is known (it is restored after the page mounted)
  const autoLoad = () => watch(() => adminAuth.isAdmin.value, (isAdmin) => {
    if (isAdmin) void load()
    else locations.value = null
  }, { immediate: true })

  const set = (list: KnownLocation[]) => {
    locations.value = list.map(location => ({ ...location, archiveMaps: location.archiveMaps?.map(map => ({ ...map })) }))
  }

  const byName = computed(() => new Map((locations.value || []).map(location => [normalizeLocationName(location.name), location])))

  // Archive map sheets of a place (empty for visitors, places without links and unknown places)
  const archiveMapsFor = (place?: string): ParsedArchiveMap[] => {
    if (!place) return []
    return (byName.value.get(normalizeLocationName(place))?.archiveMaps || [])
      .map(map => parseArchiveMapUrl(map.url))
      .filter((map): map is ParsedArchiveMap => !!map)
  }

  return { locations, load, autoLoad, set, archiveMapsFor }
}
