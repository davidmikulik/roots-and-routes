<script setup lang="ts">
// The map of /map in OpenLayers: base and historical layers (utils/map/layers.ts), event markers with optional
// clusters, migration lines and selection. The page keeps the filters and the detail panel (MapPersonPanel).
//
// - The view is Web Mercator; S-JTSK (EPSG:5514) layers are reprojected in the browser (proj4 + register).
// - Markers are drawn on the canvas (circle + emoji), not as DOM elements. Several events at one spot (also a
//   cluster that cannot be split at the maximum zoom) open a small list to choose from, with the archive map
//   sheets of their places (Admin → Known locations).
// - Right click (long press on Android) shows the GPS coordinates of the spot; clicking them copies them. Below are
//   links that open the spot in other map services (utils/map/externalMaps.ts).
// - OpenLayers objects live outside Vue reactivity.
import 'ol/ol.css'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Cluster from 'ol/source/Cluster'
import XYZ from 'ol/source/XYZ'
import WMTS from 'ol/source/WMTS'
import TileWMS from 'ol/source/TileWMS'
import WMTSTileGrid from 'ol/tilegrid/WMTS'
import ImageLayer from 'ol/layer/Image'
import LayerGroup from 'ol/layer/Group'
import type BaseLayer from 'ol/layer/Base'
import type ImageTile from 'ol/ImageTile'
import type Tile from 'ol/Tile'
import TileState from 'ol/TileState'
import Static from 'ol/source/ImageStatic'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { defaults as defaultControls } from 'ol/control/defaults'
import { fromLonLat, get as getProjection, toLonLat, transformExtent } from 'ol/proj'
import { register } from 'ol/proj/proj4'
import { boundingExtent, getHeight, getWidth } from 'ol/extent'
import proj4 from 'proj4'
import type { MapEvent } from '~~/types/gedcom'
import type { OverlayPoint } from '~~/types/locations'
import { BASE_LAYERS, HISTORIC_LAYERS, NAMES_LAYER, OVERLAY_LAYERS, type HistoricLayer, type WmsLayer, type WmtsLayer, type XyzLayer } from '~~/utils/map/layers'
import { createOverlayImageLayer } from '~~/utils/map/overlayLayer'
import type { ParsedPlaceLink } from '~~/utils/gedcom/archiveMaps'
import { EXTERNAL_MAPS } from '~~/utils/map/externalMaps'
import { useT } from '~~/composables/useT'

// A georeferenced overlay ready to draw: the image is already fetched as a blob: URL (private, needs the admin token)
export interface ResolvedOverlay {
  id: string
  width: number
  height: number
  points: OverlayPoint[]
  url: string
}

const props = defineProps<{
  events: MapEvent[]
  selectedId: string | null
  clusters: boolean
  migration: boolean
  defaultZoom: number
  baseLayer: string
  historicLayer: string
  historicOpacity: number
  placeNames: boolean
  // Ids of the transparent overlays switched on (cadastral map, RÚIAN)
  extraLayers?: string[]
  // Georeferenced uploaded sheets to draw (admin only); empty when not shown
  overlays?: ResolvedOverlay[]
  eventStyle: (type: string) => { color: string; icon: string }
  // One line in the list of events at one spot ("Narození · J. S.")
  describe: (event: MapEvent) => string
  // Links of a place, e.g. ČÚZK archive sheets (empty for visitors and in the anonymous mode)
  archiveMapsFor?: (place?: string) => ParsedPlaceLink[]
}>()
const emit = defineEmits<{
  (event: 'select', value: MapEvent): void
  (event: 'close'): void
  (event: 'ready'): void
}>()

// S-JTSK / Krovak East North, as used by ČÚZK, CENIA and the regions
if (!getProjection('EPSG:5514')) {
  proj4.defs('EPSG:5514', '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=570.8,85.7,462.8,4.998,1.587,5.261,3.56 +units=m +no_defs +type=crs')
  register(proj4)
  getProjection('EPSG:5514')?.setExtent([-925000, -1444353.536, -400646.464, -920000])
}

const { t } = useT()
const element = ref<HTMLDivElement | null>(null)
let map: OlMap | null = null
const eventSource = new VectorSource<Feature<Point>>()
const clusterSource = new Cluster({ distance: 40, minDistance: 16, source: eventSource })
const lineSource = new VectorSource<Feature<LineString>>()
const featureById = new Map<string, Feature<Point>>()
const MAX_ZOOM = 19
const CLUSTER_DISTANCE = 40

// --- layers -------------------------------------------------------------------------------------------------
const xyzLayer = (layer: XyzLayer) => new TileLayer({
  visible: false,
  source: new XYZ({ url: layer.url, attributions: layer.attribution, maxZoom: layer.maxZoom, crossOrigin: 'anonymous' }),
})
// Loads a tile and turns pure white pixels transparent (a regional service fills the area outside its region with white)
const loadWithoutWhite = (tile: Tile, src: string) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) { (tile as ImageTile).setImage(image); return }
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = pixels.data
    for (let index = 0; index < data.length; index += 4) {
      if (data[index]! >= 248 && data[index + 1]! >= 248 && data[index + 2]! >= 248) data[index + 3] = 0
    }
    context.putImageData(pixels, 0, 0)
    ;(tile as ImageTile).setImage(canvas)
  }
  image.onerror = () => tile.setState(TileState.ERROR)
  image.src = src
}
const wmtsLayer = (layer: WmtsLayer, visible = false) => new TileLayer({
  visible,
  minZoom: layer.minZoom,
  extent: transformExtent(layer.grid.extent, layer.projection, 'EPSG:3857'),
  source: new WMTS({
    url: layer.url,
    requestEncoding: 'REST',
    layer: layer.id,
    matrixSet: 'default',
    style: 'default',
    projection: layer.projection,
    tileGrid: new WMTSTileGrid({
      origin: layer.grid.origin,
      resolutions: layer.grid.scaleDenominators.map(denominator => denominator * 0.00028),
      matrixIds: layer.grid.scaleDenominators.map((_, index) => String(index)),
      tileSize: layer.grid.tileSize,
      extent: layer.grid.extent,
    }),
    attributions: layer.attribution,
    crossOrigin: 'anonymous',
    wrapX: false,
    ...(layer.whiteIsEmpty ? { tileLoadFunction: loadWithoutWhite } : {}),
  }),
})
// A group (imperial imprints of several regions) is one layer for the switch; its parts stay visible inside it
const historicLayer = (layer: HistoricLayer): BaseLayer => (layer.kind === 'group'
  ? new LayerGroup({ visible: false, minZoom: layer.minZoom, layers: layer.parts.map(part => wmtsLayer(part, true)) })
  : wmtsLayer(layer))
const baseLayers = new Map(BASE_LAYERS.map(layer => [layer.id, xyzLayer(layer)]))
const historicLayers = new Map(HISTORIC_LAYERS.map(layer => [layer.id, historicLayer(layer)]))
const wmsLayer = (layer: WmsLayer) => new TileLayer({
  visible: false,
  minZoom: layer.minZoom,
  source: new TileWMS({
    url: layer.url,
    params: { LAYERS: layer.layers, TRANSPARENT: layer.transparent, FORMAT: 'image/png', VERSION: '1.3.0' },
    projection: 'EPSG:3857',
    attributions: layer.attribution,
    crossOrigin: 'anonymous',
  }),
})
const namesLayer = wmsLayer(NAMES_LAYER)
const extraLayers = new Map(OVERLAY_LAYERS.map(layer => [layer.id, wmsLayer(layer)]))

const applyLayers = () => {
  for (const [id, layer] of baseLayers) layer.setVisible(id === props.baseLayer)
  // Unknown base id (old setting): fall back to the first one
  if (![...baseLayers.keys()].includes(props.baseLayer)) baseLayers.values().next().value?.setVisible(true)
  for (const [id, layer] of historicLayers) {
    layer.setVisible(id === props.historicLayer)
    layer.setOpacity(props.historicOpacity / 100)
  }
  namesLayer.setVisible(props.placeNames)
  for (const [id, layer] of extraLayers) layer.setVisible(!!props.extraLayers?.includes(id))
}

// --- georeferenced uploaded overlays -----------------------------------------------------------------------
// One image layer per overlay, reprojected from the sheet's pixel space to web Mercator through the affine fitted
// from the control points (a per-overlay pixel projection with custom transforms, see utils/map/affine.ts).
const overlayLayers = new Map<string, { key: string; layer: ImageLayer<Static> }>()
const buildOverlay = (overlay: ResolvedOverlay): ImageLayer<Static> | null =>
  createOverlayImageLayer(overlay.points, overlay.width, overlay.height, overlay.url)

const applyOverlays = () => {
  if (!map) return
  const wanted = props.overlays ?? []
  const wantedIds = new Set(wanted.map(o => o.id))
  for (const [id, entry] of overlayLayers) {
    if (!wantedIds.has(id)) { map.removeLayer(entry.layer); overlayLayers.delete(id) }
  }
  for (const overlay of wanted) {
    const key = `${overlay.url}|${JSON.stringify(overlay.points)}`
    const existing = overlayLayers.get(overlay.id)
    if (existing?.key === key) { existing.layer.setOpacity(props.historicOpacity / 100); continue }
    if (existing) map.removeLayer(existing.layer)
    const layer = buildOverlay(overlay)
    if (!layer) continue
    layer.setOpacity(props.historicOpacity / 100)
    // Above base + historic, below the place names and the markers
    map.getLayers().insertAt(baseLayers.size + historicLayers.size, layer)
    overlayLayers.set(overlay.id, { key, layer })
  }
}

// --- marker styles ------------------------------------------------------------------------------------------
const EMOJI_FONT = '18px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
const styleCache = new Map<string, Style[]>()
const markerStyle = (type: string, selected: boolean): Style[] => {
  const key = `${type}|${selected}`
  if (!styleCache.has(key)) {
    const { color, icon } = props.eventStyle(type)
    const styles = [
      new Style({
        zIndex: selected ? 20 : 10,
        image: new CircleStyle({
          radius: selected ? 19 : 16,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: selected ? '#1d4ed8' : '#ffffff', width: selected ? 3 : 2 }),
        }),
        text: new Text({ text: icon, font: EMOJI_FONT, offsetY: 1 }),
      }),
    ]
    if (selected) styles.unshift(new Style({ zIndex: 19, image: new CircleStyle({ radius: 25, fill: new Fill({ color: 'rgba(37,99,235,0.35)' }) }) }))
    styleCache.set(key, styles)
  }
  return styleCache.get(key)!
}
const clusterStyle = (size: number, containsSelected: boolean): Style => {
  const key = `cluster|${size}|${containsSelected}`
  if (!styleCache.has(key)) {
    styleCache.set(key, [new Style({
      zIndex: containsSelected ? 15 : 5,
      image: new CircleStyle({
        radius: size > 99 ? 20 : 17,
        fill: new Fill({ color: '#2563eb' }),
        stroke: new Stroke({ color: containsSelected ? '#1d4ed8' : '#ffffff', width: containsSelected ? 4 : 2 }),
      }),
      text: new Text({ text: String(size), font: 'bold 13px sans-serif', fill: new Fill({ color: '#ffffff' }) }),
    })])
  }
  return styleCache.get(key)![0]!
}
const eventsLayer = new VectorLayer<VectorSource<Feature<Point>>>({
  source: clusterSource as unknown as VectorSource<Feature<Point>>,
  style: (feature) => {
    const members = (feature.get('features') as Feature<Point>[] | undefined) ?? [feature as Feature<Point>]
    if (members.length > 1) return clusterStyle(members.length, members.some(member => member.getId() === props.selectedId))
    const event = members[0]!.get('event') as MapEvent
    return markerStyle(event.type, event.id === props.selectedId)
  },
})
const linesLayer = new VectorLayer({
  source: lineSource,
  style: feature => new Style({ stroke: new Stroke({ color: `${feature.get('color')}b3`, width: 2, lineDash: [5, 5] }) }),
})

// --- data ---------------------------------------------------------------------------------------------------
const coordinateOf = (event: MapEvent) => fromLonLat([event.coordinates[1], event.coordinates[0]])
const yearOf = (event: MapEvent) => Number(event.date?.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0]) || 0

const updateEvents = () => {
  featureById.clear()
  const features = props.events.map((event) => {
    const feature = new Feature({ geometry: new Point(coordinateOf(event)), event })
    feature.setId(event.id)
    featureById.set(event.id, feature)
    return feature
  })
  eventSource.clear(true)
  eventSource.addFeatures(features)
  updateLines()
}

// Each person's events in time order joined by dashed lines in the colour of the earlier event
const updateLines = () => {
  lineSource.clear(true)
  if (!props.migration) return
  const byPerson = new Map<string, MapEvent[]>()
  for (const event of props.events) byPerson.set(event.personId, [...(byPerson.get(event.personId) ?? []), event])
  for (const events of byPerson.values()) {
    const sorted = [...events].sort((first, second) => (yearOf(first) && yearOf(second) ? yearOf(first) - yearOf(second) : 0))
    for (let index = 0; index < sorted.length - 1; index++) {
      const line = new Feature({ geometry: new LineString([coordinateOf(sorted[index]!), coordinateOf(sorted[index + 1]!)]) })
      line.set('color', props.eventStyle(sorted[index]!.type).color)
      lineSource.addFeature(line)
    }
  }
}

const applyClusters = () => {
  eventsLayer.setSource(props.clusters ? clusterSource as unknown as VectorSource<Feature<Point>> : eventSource)
}

// --- view ---------------------------------------------------------------------------------------------------
let fitted = false
const fit = (): boolean => {
  if (!map || !props.events.length) return false
  const coordinates = props.events.map(coordinateOf)
  const extent = boundingExtent(coordinates)
  if (getWidth(extent) < 1 && getHeight(extent) < 1) {
    map.getView().setCenter(coordinates[0])
    map.getView().setZoom(props.defaultZoom)
  } else {
    map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 16 })
  }
  return true
}

// Lowest zoom at which the event is not in a cluster with another one; null when it never separates
const separatingZoom = (eventId: string): number | null => {
  const feature = featureById.get(eventId)
  if (!map || !feature) return null
  const [x, y] = feature.getGeometry()!.getCoordinates() as [number, number]
  let nearest = Infinity
  for (const other of featureById.values()) {
    if (other === feature) continue
    const [ox, oy] = other.getGeometry()!.getCoordinates() as [number, number]
    nearest = Math.min(nearest, Math.hypot(ox - x, oy - y))
  }
  if (nearest === Infinity) return map.getView().getZoom() ?? props.defaultZoom
  const view = map.getView()
  for (let zoom = Math.ceil(view.getZoom() ?? 0); zoom <= MAX_ZOOM; zoom++) {
    if (nearest / view.getResolutionForZoom(zoom) > CLUSTER_DISTANCE) return zoom
  }
  return null
}

// --- list of events at one spot -----------------------------------------------------------------------------
const chooser = ref<{ x: number; y: number; events: MapEvent[] } | null>(null)
const choose = (event: MapEvent) => {
  chooser.value = null
  emit('select', event)
}

// Archive map sheets of the places of these events, one group per place that has some
type PlaceMaps = { place: string; maps: ParsedPlaceLink[] }
const placeMaps = (events: MapEvent[]): PlaceMaps[] => {
  const mapsFor = props.archiveMapsFor
  if (!mapsFor) return []
  const places = [...new Set(events.map(event => event.place).filter((place): place is string => !!place))]
  return places.map(place => ({ place, maps: mapsFor(place) })).filter(entry => entry.maps.length)
}
const chooserMaps = computed(() => (chooser.value ? placeMaps(chooser.value.events) : []))

// --- right click: GPS coordinates of the spot (and the archive sheets of markers under it) ----------------------
const context = ref<{ x: number; y: number; lat: number; lon: number; zoom: number; places: PlaceMaps[] } | null>(null)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const coordinatesText = computed(() => (context.value ? `${context.value.lat.toFixed(6)}, ${context.value.lon.toFixed(6)}` : ''))

const eventsAtPixel = (pixel: number[]): MapEvent[] => {
  if (!map) return []
  const hits = map.getFeaturesAtPixel(pixel, { layerFilter: layer => layer === eventsLayer, hitTolerance: 4 })
  const members = hits.flatMap(hit => (hit.get('features') as Feature<Point>[] | undefined) ?? [hit as Feature<Point>])
  return [...new Map(members.map(feature => [feature.getId(), feature.get('event') as MapEvent])).values()]
}

const onContextMenu = (domEvent: MouseEvent) => {
  if (!map) return
  domEvent.preventDefault()
  chooser.value = null
  const pixel = map.getEventPixel(domEvent)
  const [lon, lat] = toLonLat(map.getCoordinateFromPixel(pixel)) as [number, number]
  copyState.value = 'idle'
  context.value = { x: pixel[0]!, y: pixel[1]!, lat, lon, zoom: map.getView().getZoom() ?? props.defaultZoom, places: placeMaps(eventsAtPixel(pixel)) }
}

// navigator.clipboard needs a secure context; the textarea fallback covers plain http (e.g. the dev server on a LAN address)
const copyCoordinates = async () => {
  const text = coordinatesText.value
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text)
    else {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      if (!ok) throw new Error('execCommand copy failed')
    }
    copyState.value = 'copied'
  } catch (error) {
    console.error('[MAP] Coordinates could not be copied:', error)
    copyState.value = 'failed'
  }
}

// Keeps a popup inside the map horizontally
const popupLeft = (x: number) => `${Math.max(4, Math.min(x, (element.value?.clientWidth ?? 300) - 270))}px`

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  chooser.value = null
  context.value = null
}

const onClick = (pixel: number[]) => {
  chooser.value = null
  context.value = null
  if (!map) return
  const hit = map.forEachFeatureAtPixel(pixel, feature => feature as Feature, { layerFilter: layer => layer === eventsLayer, hitTolerance: 4 })
  if (!hit) {
    emit('close')
    return
  }
  const members = (hit.get('features') as Feature<Point>[] | undefined) ?? [hit as Feature<Point>]
  // Without clusters several markers may lie on top of each other
  const all = props.clusters
    ? members
    : (map.getFeaturesAtPixel(pixel, { layerFilter: layer => layer === eventsLayer, hitTolerance: 4 }) as Feature<Point>[])
  const events = [...new Map(all.map(feature => [feature.getId(), feature.get('event') as MapEvent])).values()]
  if (events.length === 1) {
    emit('select', events[0]!)
    return
  }
  const extent = boundingExtent(all.map(feature => feature.getGeometry()!.getCoordinates()))
  const view = map.getView()
  const canSplit = props.clusters && (getWidth(extent) > 1 || getHeight(extent) > 1) && (view.getZoom() ?? 0) < MAX_ZOOM - 1
  if (canSplit) view.fit(extent, { padding: [80, 80, 80, 80], duration: 300, maxZoom: MAX_ZOOM })
  else chooser.value = { x: pixel[0]!, y: pixel[1]!, events }
}

// --- exposed to the page ------------------------------------------------------------------------------------
// Moves the map just enough so the event is clear of the detail panel and not too close to the map edge
const reveal = async (eventId: string) => {
  await nextTick()
  const feature = featureById.get(eventId)
  const panel = document.querySelector('[data-map-panel]')
  if (!map || !feature || !panel || !element.value) return
  const container = element.value.getBoundingClientRect()
  const box = panel.getBoundingClientRect()
  const pixel = map.getPixelFromCoordinate(feature.getGeometry()!.getCoordinates())
  if (!pixel) return
  const point = { x: pixel[0]!, y: pixel[1]! }
  const edge = 40
  const left = box.left - container.left - edge
  const right = box.right - container.left + edge
  const top = box.top - container.top - edge
  const bottom = box.bottom - container.top + edge
  // Only the part of the map that is on screen counts (the map may be partly scrolled out of the window)
  const minY = Math.max(0, -container.top) + edge
  const maxY = Math.min(container.height, window.innerHeight - container.top) - edge
  const fits = (dx: number, dy: number) => point.x - dx >= edge && point.x - dx <= container.width - edge && point.y - dy >= minY && point.y - dy <= maxY
  const covered = point.x > left && point.x < right && point.y > top && point.y < bottom
  const options = covered ? [[0, point.y - top], [point.x - left, 0], [point.x - right, 0], [0, point.y - bottom]] : [[0, 0]]
  const clampX = Math.min(0, point.x - edge) + Math.max(0, point.x - (container.width - edge))
  const clampY = Math.min(0, point.y - minY) + Math.max(0, point.y - maxY)
  const [dx, dy] = options.filter(([x, y]) => fits(x!, y!)).sort((a, c) => Math.abs(a[0]!) + Math.abs(a[1]!) - Math.abs(c[0]!) - Math.abs(c[1]!))[0]
    ?? [clampX, clampY]
  const shiftX = covered ? dx! : clampX
  const shiftY = covered ? dy! : clampY
  if (!shiftX && !shiftY) return
  const size = map.getSize()!
  const center = map.getCoordinateFromPixel([size[0]! / 2 + shiftX, size[1]! / 2 + shiftY])
  map.getView().animate({ center, duration: 250 })
}

// Selecting an event in the panel: zoom in until its marker leaves the cluster, centre it, then keep it clear of the panel
const goTo = (eventId: string) => {
  const feature = featureById.get(eventId)
  if (!map || !feature) return
  chooser.value = null
  const view = map.getView()
  const zoom = props.clusters ? (separatingZoom(eventId) ?? MAX_ZOOM) : (view.getZoom() ?? props.defaultZoom)
  view.animate({ center: feature.getGeometry()!.getCoordinates(), zoom: Math.max(zoom, view.getZoom() ?? 0), duration: 300 }, () => reveal(eventId))
}

const container = () => element.value

defineExpose({ reveal, goTo, container, fit })

// --- lifecycle ----------------------------------------------------------------------------------------------
// In a .client component the template ref may still be empty in onMounted: wait for it
const whenElement = async (): Promise<HTMLDivElement | null> => {
  for (let attempt = 0; attempt < 20 && !element.value; attempt++) await new Promise(resolve => requestAnimationFrame(resolve))
  return element.value
}

onMounted(async () => {
  if (!await whenElement()) return
  map = new OlMap({
    target: element.value!,
    layers: [...baseLayers.values(), ...historicLayers.values(), namesLayer, ...extraLayers.values(), linesLayer, eventsLayer],
    view: new View({ center: fromLonLat([14.4378, 50.0755]), zoom: props.defaultZoom, maxZoom: MAX_ZOOM }),
    controls: defaultControls({ attributionOptions: { collapsible: true, collapsed: false } }),
  })
  applyLayers()
  applyOverlays()
  applyClusters()
  updateEvents()
  fitted = fit()
  map.on('singleclick', event => onClick(event.pixel))
  map.on('pointermove', (event) => {
    if (event.dragging || !element.value) return
    element.value.style.cursor = map!.hasFeatureAtPixel(event.pixel, { layerFilter: layer => layer === eventsLayer, hitTolerance: 4 }) ? 'pointer' : ''
  })
  map.on('movestart', () => { chooser.value = null; context.value = null })
  element.value!.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKeydown)
  if (import.meta.dev) {
    // Hook for the browser tests (docs: skill test-ui): pixel of an event's marker
    ;(window as any).__eventMap = {
      map,
      events: () => props.events.map(event => ({ id: event.id, personId: event.personId, place: event.place, coordinates: event.coordinates })),
      selectedId: () => props.selectedId,
      // How many events share the cluster of this event at the current zoom (1 = its own marker)
      clusterSizeOf: (eventId: string) => clusterSource.getFeatures().find(feature => (feature.get('features') as Feature[]).some(member => member.getId() === eventId))?.get('features').length ?? 0,
      pixelOf: (eventId: string) => {
        const feature = featureById.get(eventId)
        return feature ? map!.getPixelFromCoordinate(feature.getGeometry()!.getCoordinates()) : null
      },
      // Builds one overlay layer directly (independent of props) and reports where it lands + whether its image loaded
      testOverlay: (overlay: ResolvedOverlay) => new Promise((resolve) => {
        const layer = buildOverlay(overlay)
        if (!layer) return resolve({ built: false })
        const source = layer.getSource()!
        source.on('imageloadend', () => resolve({ built: true, loaded: true, projExtent: source.getProjection()!.getExtent() }))
        source.on('imageloaderror', () => resolve({ built: true, loaded: false }))
        map!.getLayers().insertAt(1, layer)
      }),
    }
  }
  emit('ready')
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  map?.setTarget(undefined)
  map = null
})

watch(() => props.events, () => {
  updateEvents()
  if (!fitted) fitted = fit()
})
watch(() => props.migration, updateLines)
watch(() => props.clusters, applyClusters)
watch(() => props.selectedId, () => eventsLayer.changed())
watch(() => [props.baseLayer, props.historicLayer, props.historicOpacity, props.placeNames, props.extraLayers], applyLayers, { deep: true })
watch(() => [props.overlays, props.historicOpacity], applyOverlays, { deep: true })
watch(() => props.defaultZoom, () => { if (!props.events.length) map?.getView().setZoom(props.defaultZoom) })
// Event styles depend on the language only through labels in the list, but the icons/colours are cached per type
watch(() => props.eventStyle, () => { styleCache.clear(); eventsLayer.changed() })
</script>

<template>
  <div class="relative">
    <div ref="element" class="h-full w-full" data-event-map />
    <div
      v-if="chooser"
      class="absolute z-[1000] max-h-64 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-800"
      :style="{ left: popupLeft(chooser.x), top: `${chooser.y + 12}px` }"
      data-event-chooser
    >
      <button
        v-for="event in chooser.events"
        :key="event.id"
        type="button"
        class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
        @click="choose(event)"
      >
        <span aria-hidden="true">{{ eventStyle(event.type).icon }}</span>
        <span class="min-w-0 flex-1 truncate">{{ describe(event) }}</span>
      </button>
      <div v-if="chooserMaps.length" class="mt-1 border-t border-gray-200 px-2 pb-1 pt-1.5 dark:border-gray-700" data-chooser-archive>
        <div v-for="(entry, index) in chooserMaps" :key="entry.place" class="mb-1">
          <p class="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{{ entry.place }}</p>
          <ArchiveMapLinks :maps="entry.maps" :show-source="index === chooserMaps.length - 1" />
        </div>
      </div>
    </div>
    <div
      v-if="context"
      class="absolute z-[1000] max-h-72 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-800"
      :style="{ left: popupLeft(context.x), top: `${context.y + 12}px` }"
      data-map-context
    >
      <button
        type="button"
        class="w-full rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
        :title="t('map.coords.copyTitle')"
        @click="copyCoordinates"
      >
        <span class="block text-xs text-gray-500 dark:text-gray-400">{{ t('map.coords.title') }}</span>
        <span class="block font-mono text-gray-900 dark:text-gray-100">📍 {{ coordinatesText }}</span>
        <span
          class="block text-xs"
          :class="copyState === 'copied' ? 'text-green-700 dark:text-green-400' : copyState === 'failed' ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'"
          aria-live="polite"
        >{{ copyState === 'copied' ? t('map.coords.copied') : copyState === 'failed' ? t('map.coords.failed') : t('map.coords.copyHint') }}</span>
      </button>
      <ul class="px-2 pb-1 text-xs" data-external-maps>
        <li v-for="service in EXTERNAL_MAPS" :key="service.id">
          <a
            :href="service.url(context.lat, context.lon, context.zoom)"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-700 underline dark:text-primary-300"
            @click="context = null"
          >{{ t('map.coords.openIn', { name: service.name }) }} ↗</a>
        </li>
      </ul>
      <div v-if="context.places.length" class="mt-1 border-t border-gray-200 px-2 pb-1 pt-1.5 dark:border-gray-700">
        <div v-for="(entry, index) in context.places" :key="entry.place" class="mb-1">
          <p class="truncate text-xs font-medium text-gray-700 dark:text-gray-200">{{ entry.place }}</p>
          <ArchiveMapLinks :maps="entry.maps" :show-source="index === context.places.length - 1" />
        </div>
      </div>
    </div>
  </div>
</template>
