<script setup lang="ts">
// Georeferencing editor: places an uploaded scanned sheet onto the current map. The admin clicks the same spot on
// the sheet (left) and on the map (right); from ≥3 such control points an affine transform is fitted and the sheet
// is previewed over the map with adjustable opacity. Shows each point's residual (metres).
// A point is edited by dragging its marker on either side, or with "Move": the next clicks on the sheet / the map
// move that point's pixel / position (handy on touch screens).
import 'ol/ol.css'
import OlMap from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import ImageLayer from 'ol/layer/Image'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Static from 'ol/source/ImageStatic'
import XYZ from 'ol/source/XYZ'
import Projection from 'ol/proj/Projection'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Translate from 'ol/interaction/Translate'
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { defaults as defaultControls } from 'ol/control/defaults'
import { fromLonLat } from 'ol/proj'
import { boundingExtent, getCenter } from 'ol/extent'
import type { MapBrowserEvent } from 'ol'
import type { ControlPoint } from '~~/types/mapLayers'
import { affineFromPoints, residuals } from '~~/utils/map/affine'
import { createOverlayImageLayer } from '~~/utils/map/overlayLayer'
import { BASE_LAYERS } from '~~/utils/map/layers'
import { MAX_POINTS, MIN_POINTS } from '~~/utils/map/mapLayers'
import { useT } from '~~/composables/useT'
import type { MessageKey } from '~~/i18n'

const props = defineProps<{
  imageUrl: string
  width: number
  height: number
  initialPoints?: ControlPoint[]
  // Where to look on the map when the sheet has no points yet: points of the other sheets of the layer (web Mercator)
  focusPoints?: [number, number][]
  // Known places for "Go to place"
  places?: { name: string; lon: number; lat: number }[]
}>()
const emit = defineEmits<{ (e: 'change', points: ControlPoint[]): void }>()
const { t } = useT()

const points = ref<ControlPoint[]>((props.initialPoints ?? []).map(p => ({ ...p })))
// A half-finished point: a pixel clicked on the sheet, waiting for its map spot (or the other way round)
const pending = ref<{ px: number; py: number } | { x: number; y: number } | null>(null)
// The point being moved with "Move" (index), null when not moving
const moving = ref<number | null>(null)
const opacity = ref(70)
const baseLayerId = ref('osm')
const placeQuery = ref('')

const sheetEl = ref<HTMLDivElement | null>(null)
const geoEl = ref<HTMLDivElement | null>(null)
let sheetMap: OlMap | null = null
let geoMap: OlMap | null = null
const sheetPoints = new VectorSource()
const geoPoints = new VectorSource()
let previewLayer: ImageLayer<Static> | null = null

const fit = computed(() => (points.value.length >= MIN_POINTS ? affineFromPoints(points.value) : null))
const pointResiduals = computed(() => (fit.value ? residuals(fit.value, points.value) : []))
const maxResidual = computed(() => (pointResiduals.value.length ? Math.max(...pointResiduals.value) : 0))
// The point that fits worst (worth checking first); only with more points than the minimum, where it can differ
const worstIndex = computed(() => (points.value.length > MIN_POINTS && maxResidual.value > 0 ? pointResiduals.value.indexOf(maxResidual.value) : -1))
const collinear = computed(() => points.value.length >= MIN_POINTS && !fit.value)
const full = computed(() => points.value.length >= MAX_POINTS)

const imageExtent: [number, number, number, number] = [0, -props.height, props.width, 0]

const COLOR = { point: '#2563eb', pending: '#f59e0b', moving: '#16a34a', worst: '#dc2626' }
const markerStyle = (label: string, color: string) => new Style({
  image: new CircleStyle({ radius: 11, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
  text: new Text({ text: label, font: 'bold 12px sans-serif', fill: new Fill({ color: '#fff' }) }),
})
const pointColor = (index: number) => (index === moving.value ? COLOR.moving : index === worstIndex.value ? COLOR.worst : COLOR.point)

const redraw = () => {
  sheetPoints.clear(); geoPoints.clear()
  points.value.forEach((p, index) => {
    const style = markerStyle(String(index + 1), pointColor(index))
    const s = new Feature({ geometry: new Point([p.px, -p.py]), index }); s.setStyle(style); sheetPoints.addFeature(s)
    const g = new Feature({ geometry: new Point([p.x, p.y]), index }); g.setStyle(style); geoPoints.addFeature(g)
  })
  if (pending.value && 'px' in pending.value) {
    const f = new Feature(new Point([pending.value.px, -pending.value.py])); f.setStyle(markerStyle('?', COLOR.pending)); sheetPoints.addFeature(f)
  } else if (pending.value) {
    const f = new Feature(new Point([pending.value.x, pending.value.y])); f.setStyle(markerStyle('?', COLOR.pending)); geoPoints.addFeature(f)
  }
  updatePreview()
  emit('change', points.value)
}

const updatePreview = () => {
  if (!geoMap) return
  if (previewLayer) { geoMap.removeLayer(previewLayer); previewLayer = null }
  if (points.value.length < MIN_POINTS) return
  previewLayer = createOverlayImageLayer(points.value, props.width, props.height, props.imageUrl)
  if (previewLayer) { previewLayer.setOpacity(opacity.value / 100); geoMap.getLayers().insertAt(1, previewLayer) }
}

const setPoint = (index: number, change: Partial<ControlPoint>) => {
  points.value = points.value.map((p, i) => (i === index ? { ...p, ...change } : p))
}

const addHalf = (half: { px: number; py: number } | { x: number; y: number }) => {
  // Moving a point: the click replaces that half of it
  if (moving.value !== null) { setPoint(moving.value, half); redraw(); return }
  if (full.value) return
  if (!pending.value) { pending.value = half; redraw(); return }
  // Complete only when the two halves are of different kinds
  const havePixel = 'px' in pending.value
  const gotPixel = 'px' in half
  if (havePixel === gotPixel) { pending.value = half; redraw(); return }
  const pixel = (havePixel ? pending.value : half) as { px: number; py: number }
  const geo = (havePixel ? half : pending.value) as { x: number; y: number }
  points.value = [...points.value, { px: pixel.px, py: pixel.py, x: geo.x, y: geo.y }]
  pending.value = null
  redraw()
}

const removePoint = (index: number) => {
  points.value = points.value.filter((_, i) => i !== index)
  if (moving.value === index) moving.value = null
  else if (moving.value !== null && moving.value > index) moving.value--
  redraw()
}
const startMoving = (index: number) => { pending.value = null; moving.value = moving.value === index ? null : index; redraw() }
const stopMoving = () => { moving.value = null; redraw() }
const clearPending = () => { pending.value = null; redraw() }

const onKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || (moving.value === null && !pending.value)) return
  // Do not close the surrounding dialog
  event.stopPropagation()
  moving.value = null; pending.value = null; redraw()
}

const goToPlace = () => {
  const name = placeQuery.value.trim().toLocaleLowerCase()
  const place = props.places?.find(p => p.name.toLocaleLowerCase() === name)
  if (!place || !geoMap) return
  geoMap.getView().animate({ center: fromLonLat([place.lon, place.lat]), zoom: 15, duration: 300 })
}

watch(opacity, () => previewLayer?.setOpacity(opacity.value / 100))
watch(baseLayerId, () => {
  const layer = BASE_LAYERS.find(l => l.id === baseLayerId.value) ?? BASE_LAYERS[0]!
  geoBase.setSource(new XYZ({ url: layer.url, maxZoom: layer.maxZoom, crossOrigin: 'anonymous' }))
})

const geoBase = new TileLayer({ source: new XYZ({ url: BASE_LAYERS[0]!.url, maxZoom: BASE_LAYERS[0]!.maxZoom, crossOrigin: 'anonymous' }) })

defineExpose({ points: () => points.value, maxResidual: () => maxResidual.value, valid: () => !!fit.value })

// Dragging a marker moves that half of the point
const dragging = (layer: VectorLayer<VectorSource>, side: 'sheet' | 'geo') => {
  const translate = new Translate({ layers: [layer], filter: feature => feature.get('index') !== undefined, hitTolerance: 4 })
  translate.on('translateend', (event) => {
    for (const feature of event.features.getArray()) {
      const [cx, cy] = (feature.getGeometry() as Point).getCoordinates()
      setPoint(feature.get('index'), side === 'sheet' ? { px: cx!, py: -cy! } : { x: cx!, y: cy! })
    }
    redraw()
  })
  return translate
}

// A click on a marker (e.g. the end of a drag without movement) does not start a new point; while moving a point
// every click counts
const onMarker = (map: OlMap, event: MapBrowserEvent<any>) =>
  moving.value === null && map.forEachFeatureAtPixel(event.pixel, feature => feature.get('index') !== undefined, { hitTolerance: 4 }) === true

const initialGeoView = (): { extent?: number[]; center: number[]; zoom: number } => {
  const own = points.value.map(p => [p.x, p.y])
  const coords = own.length ? own : (props.focusPoints ?? [])
  if (coords.length >= 2) return { extent: boundingExtent(coords), center: getCenter(boundingExtent(coords)), zoom: 14 }
  if (coords.length === 1) return { center: coords[0]!, zoom: 15 }
  return { center: fromLonLat([15.5, 49.8]), zoom: 7 }
}

onMounted(async () => {
  for (let i = 0; i < 20 && (!sheetEl.value || !geoEl.value); i++) await new Promise(r => requestAnimationFrame(r))
  if (!sheetEl.value || !geoEl.value) return
  const sheetProjection = new Projection({ code: 'sheet-pixels', units: 'pixels', extent: imageExtent })
  const sheetVector = new VectorLayer({ source: sheetPoints })
  sheetMap = new OlMap({
    target: sheetEl.value,
    layers: [
      new ImageLayer({ source: new Static({ url: props.imageUrl, projection: sheetProjection, imageExtent }) }),
      sheetVector,
    ],
    view: new View({ projection: sheetProjection, center: getCenter(imageExtent), zoom: 1, maxZoom: 8 }),
    controls: defaultControls(),
  })
  sheetMap.getView().fit(imageExtent, { padding: [10, 10, 10, 10] })
  sheetMap.addInteraction(dragging(sheetVector, 'sheet'))
  sheetMap.on('singleclick', (e) => { if (!onMarker(sheetMap!, e)) addHalf({ px: e.coordinate[0]!, py: -e.coordinate[1]! }) })

  const geoVector = new VectorLayer({ source: geoPoints })
  const start = initialGeoView()
  geoMap = new OlMap({
    target: geoEl.value,
    layers: [geoBase, geoVector],
    view: new View({ center: start.center, zoom: start.zoom, maxZoom: 20 }),
    controls: defaultControls(),
  })
  if (start.extent) geoMap.getView().fit(start.extent, { padding: [40, 40, 40, 40], maxZoom: 17 })
  geoMap.addInteraction(dragging(geoVector, 'geo'))
  geoMap.on('singleclick', (e) => { if (!onMarker(geoMap!, e)) addHalf({ x: e.coordinate[0]!, y: e.coordinate[1]! }) })
  redraw()
  window.addEventListener('keydown', onKeydown, true)

  if (import.meta.dev) {
    ;(window as any).__overlayEditor = {
      addPoint: (px: number, py: number, lon: number, lat: number) => { const [x, y] = fromLonLat([lon, lat]); points.value = [...points.value, { px, py, x, y }]; redraw() },
      points: () => points.value,
      maxResidual: () => maxResidual.value,
      hasPreview: () => !!previewLayer,
      sheetMap: () => sheetMap,
      geoMap: () => geoMap,
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  sheetMap?.setTarget(undefined); geoMap?.setTarget(undefined); sheetMap = null; geoMap = null
})
</script>

<template>
  <div>
    <p class="mb-2 text-sm opacity-75">{{ t('overlay.hint') }}</p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <div class="mb-1 flex min-h-7 items-center text-xs font-semibold uppercase tracking-wide opacity-60">{{ t('overlay.sheet') }}</div>
        <div ref="sheetEl" class="h-80 w-full rounded border border-gray-300 dark:border-gray-600" data-sheet-map />
      </div>
      <div>
        <div class="mb-1 flex min-h-7 flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide opacity-60">{{ t('overlay.map') }}</span>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="places?.length">
              <input v-model="placeQuery" list="overlay-places" class="w-36 rounded border px-2 py-0.5 text-xs bg-transparent" :placeholder="t('overlay.goToPlace')" :aria-label="t('overlay.goToPlace')" data-go-to-place @change="goToPlace" @keydown.enter.prevent="goToPlace">
              <datalist id="overlay-places">
                <option v-for="place in places" :key="place.name" :value="place.name" />
              </datalist>
            </template>
            <select v-model="baseLayerId" class="rounded border px-2 py-0.5 text-xs bg-transparent" :aria-label="t('map.layers.base')">
              <option v-for="layer in BASE_LAYERS" :key="layer.id" :value="layer.id">{{ t(layer.label as MessageKey) }}</option>
            </select>
          </div>
        </div>
        <div ref="geoEl" class="h-80 w-full rounded border border-gray-300 dark:border-gray-600" data-geo-map />
      </div>
    </div>

    <p v-if="moving !== null" class="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-200" data-moving>
      {{ t('overlay.movingHint', { n: moving + 1 }) }}
      <button type="button" class="ml-2 underline" @click="stopMoving">{{ t('overlay.moveDone') }}</button>
    </p>

    <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
      <span>{{ t('overlay.points', { n: points.length }) }}</span>
      <button v-if="pending" type="button" class="underline text-amber-700 dark:text-amber-300" @click="clearPending">{{ t('overlay.cancelPending') }}</button>
      <span v-if="full" class="text-amber-700 dark:text-amber-300">{{ t('overlay.maxPoints', { n: MAX_POINTS }) }}</span>
      <template v-if="fit">
        <span :class="maxResidual > 50 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-400'">{{ t('overlay.maxResidual', { m: Math.round(maxResidual) }) }}</span>
        <label class="flex items-center gap-2">{{ t('overlay.opacity') }}
          <input v-model.number="opacity" type="range" min="0" max="100" step="5">
        </label>
      </template>
      <span v-else-if="collinear" class="text-amber-700 dark:text-amber-300">{{ t('overlay.collinear') }}</span>
      <span v-else class="text-amber-700 dark:text-amber-300">{{ t('overlay.needThree') }}</span>
    </div>

    <ol v-if="points.length" class="mt-2 space-y-1 text-sm" data-point-list>
      <li v-for="(p, index) in points" :key="index" class="flex flex-wrap items-center gap-x-3 gap-y-1" :data-point="index + 1">
        <span class="inline-grid h-5 w-5 place-items-center rounded-full text-xs text-white" :style="{ background: pointColor(index) }">{{ index + 1 }}</span>
        <span class="opacity-70">{{ Math.round(p.px) }}, {{ Math.round(p.py) }} px</span>
        <span v-if="pointResiduals[index] !== undefined" :class="index === worstIndex ? 'font-semibold text-red-700 dark:text-red-300' : 'opacity-60'">
          · {{ Math.round(pointResiduals[index]!) }} m<template v-if="index === worstIndex"> ({{ t('overlay.worst') }})</template>
        </span>
        <button type="button" class="underline" :aria-pressed="moving === index" data-move-point @click="startMoving(index)">{{ moving === index ? t('overlay.moveDone') : t('overlay.movePoint') }}</button>
        <button type="button" class="text-red-700 underline dark:text-red-300" data-remove-point @click="removePoint(index)">{{ t('overlay.removePoint') }}</button>
      </li>
    </ol>
  </div>
</template>
