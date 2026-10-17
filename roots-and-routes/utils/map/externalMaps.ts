// External map services offered in the right-click popup of /map ("Otevřít v …"). Each one builds a URL from the
// clicked point (WGS84) and the current zoom of our map. A new service is one more entry here; the popup lists them all.
export interface ExternalMap {
  id: string
  // Shown as "Otevřít v {name}"; a product name, not translated
  name: string
  url: (lat: number, lon: number, zoom: number) => string
}

const coord = (value: number) => value.toFixed(6)
const zoomLevel = (zoom: number) => Math.round(Math.min(Math.max(zoom, 3), 19))

export const EXTERNAL_MAPS: ExternalMap[] = [
  {
    id: 'mapy-com',
    name: 'Mapy.com',
    // Official URL API of Mapy.com: centre + zoom with a marker on the point
    url: (lat, lon, zoom) => `https://mapy.com/fnc/v1/showmap?mapset=basic&center=${coord(lon)},${coord(lat)}&zoom=${zoomLevel(zoom)}&marker=true`,
  },
  {
    id: 'google',
    name: 'Google Maps',
    // Maps URLs (api=1): a pin on the coordinates; the search form takes no zoom
    url: (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${coord(lat)},${coord(lon)}`,
  },
]
