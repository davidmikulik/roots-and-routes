<script setup lang="ts">
// Georeferencing editor: places an uploaded scanned sheet onto the current map. The admin clicks the same spot on
// the sheet (left) and on the map (right); from ≥3 such control points an affine transform is fitted and the sheet
// is previewed over the map with adjustable opacity. Shows each point's residual (metres).
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
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style'
import { defaults as defaultControls } from 'ol/control/defaults'
import { fromLonLat } from 'ol/proj'
import { getCenter } from 'ol/extent'
import type { OverlayPoint } from '~~/types/locations'
import { affineFromPoints, residuals } from '~~/utils/map/affine'
import { createOverlayImageLayer } from '~~/utils/map/overlayLayer'
import { BASE_LAYERS } from '~~/utils/map/layers'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  imageUrl: string
  width: number
  height: number
  center: [number, number] | null
  initialPoints?: OverlayPoint[]
}>()
const emit = defineEmits<{ (e: 'change', points: OverlayPoint[]): void }>()
const { t } = useT()

const points = ref<OverlayPoint[]>((props.initialPoints ?? []).map(p => ({ ...p })))
// A half-finished point: a pixel clicked on the sheet, waiting for its map spot (or the other way round)
const pending = ref<{ px: number; py: number } | { x: number; y: number } | null>(null)
const opacity = ref(70)
const baseLayerId = ref('osm')

const sheetEl = ref<HTMLDivElement | null>(null)
const geoEl = ref<HTMLDivElement | null>(null)
let sheetMap: OlMap | null = null
let geoMap: OlMap | null = null
const sheetPoints = new VectorSource()
const geoPoints = new VectorSource()
let previewLayer: ImageLayer<Static> | null = null

const fit = computed(() => (points.value.length >= 3 ? affineFromPoints(points.value) : null))
const pointResiduals = computed(() => (fit.value ? residuals(fit.value, points.value) : []))
const maxResidual = computed(() => (pointResiduals.value.length ? Math.max(...pointResiduals.value) : 0))

const imageExtent: [number, number, number, number] = [0, -props.height, props.width, 0]

const markerStyle = (label: string, color: string) => new Style({
  image: new CircleStyle({ radius: 11, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
  text: new Text({ text: label, font: 'bold 12px sans-serif', fill: new Fill({ color: '#fff' }) }),
})

const redraw = () => {
  sheetPoints.clear(); geoPoints.clear()
  points.value.forEach((p, index) => {
    const s = new Feature(new Point([p.px, -p.py])); s.setStyle(markerStyle(String(index + 1), '#2563eb')); sheetPoints.addFeature(s)
    const g = new Feature(new Point([p.x, p.y])); g.setStyle(markerStyle(String(index + 1), '#2563eb')); geoPoints.addFeature(g)
  })
  if (pending.value && 'px' in pending.value) {
    const f = new Feature(new Point([pending.value.px, -pending.value.py])); f.setStyle(markerStyle('?', '#f59e0b')); sheetPoints.addFeature(f)
  } else if (pending.value) {
    const f = new Feature(new Point([pending.value.x, pending.value.y])); f.setStyle(markerStyle('?', '#f59e0b')); geoPoints.addFeature(f)
  }
  updatePreview()
  emit('change', points.value)
}

const updatePreview = () => {
  if (!geoMap) return
  if (previewLayer) { geoMap.removeLayer(previewLayer); previewLayer = null }
  if (points.value.length < 3) return
  previewLayer = createOverlayImageLayer(points.value, props.width, props.height, props.imageUrl)
  if (previewLayer) { previewLayer.setOpacity(opacity.value / 100); geoMap.getLayers().insertAt(1, previewLayer) }
}

const addHalf = (half: { px: number; py: number } | { x: number; y: number }) => {
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

const removePoint = (index: number) => { points.value = points.value.filter((_, i) => i !== index); redraw() }
const clearPending = () => { pending.value = null; redraw() }

watch(opacity, () => previewLayer?.setOpacity(opacity.value / 100))
watch(baseLayerId, () => {
  const layer = BASE_LAYERS.find(l => l.id === baseLayerId.value) ?? BASE_LAYERS[0]!
  geoBase.setSource(new XYZ({ url: layer.url, maxZoom: layer.maxZoom, crossOrigin: 'anonymous' }))
})

const geoBase = new TileLayer({ source: new XYZ({ url: BASE_LAYERS[0]!.url, maxZoom: BASE_LAYERS[0]!.maxZoom, crossOrigin: 'anonymous' }) })

defineExpose({ points: () => points.value, maxResidual: () => maxResidual.value })

onMounted(async () => {
  for (let i = 0; i < 20 && (!sheetEl.value || !geoEl.value); i++) await new Promise(r => requestAnimationFrame(r))
  if (!sheetEl.value || !geoEl.value) return
  const sheetProjection = new Projection({ code: 'sheet-pixels', units: 'pixels', extent: imageExtent })
  sheetMap = new OlMap({
    target: sheetEl.value,
    layers: [
      new ImageLayer({ source: new Static({ url: props.imageUrl, projection: sheetProjection, imageExtent }) }),
      new VectorLayer({ source: sheetPoints }),
    ],
    view: new View({ projection: sheetProjection, center: getCenter(imageExtent), zoom: 1, maxZoom: 8 }),
    controls: defaultControls(),
  })
  sheetMap.getView().fit(imageExtent, { padding: [10, 10, 10, 10] })
  sheetMap.on('singleclick', (e) => { addHalf({ px: e.coordinate[0]!, py: -e.coordinate[1]! }) })

  geoMap = new OlMap({
    target: geoEl.value,
    layers: [geoBase, new VectorLayer({ source: geoPoints })],
    view: new View({ center: props.center ? fromLonLat(props.center) : fromLonLat([15.5, 49.8]), zoom: props.center ? 15 : 7, maxZoom: 20 }),
    controls: defaultControls(),
  })
  geoMap.on('singleclick', (e) => { addHalf({ x: e.coordinate[0]!, y: e.coordinate[1]! }) })
  redraw()

  if (import.meta.dev) {
    ;(window as any).__overlayEditor = {
      addPoint: (px: number, py: number, lon: number, lat: number) => { const [x, y] = fromLonLat([lon, lat]); points.value = [...points.value, { px, py, x, y }]; redraw() },
      points: () => points.value,
      maxResidual: () => maxResidual.value,
      hasPreview: () => !!previewLayer,
    }
  }
})

onUnmounted(() => { sheetMap?.setTarget(undefined); geoMap?.setTarget(undefined); sheetMap = null; geoMap = null })
</script>

<template>
  <div>
    <p class="mb-2 text-sm opacity-75">{{ t('overlay.hint') }}</p>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <div class="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{{ t('overlay.sheet') }}</div>
        <div ref="sheetEl" class="h-80 w-full rounded border border-gray-300 dark:border-gray-600" data-sheet-map />
      </div>
      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide opacity-60">{{ t('overlay.map') }}</span>
          <select v-model="baseLayerId" class="rounded border px-2 py-0.5 text-xs bg-transparent">
            <option v-for="layer in BASE_LAYERS" :key="layer.id" :value="layer.id">{{ t(layer.label as any) }}</option>
          </select>
        </div>
        <div ref="geoEl" class="h-80 w-full rounded border border-gray-300 dark:border-gray-600" data-geo-map />
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
      <span>{{ t('overlay.points', { n: points.length }) }}</span>
      <button v-if="pending" type="button" class="underline text-amber-700 dark:text-amber-300" @click="clearPending">{{ t('overlay.cancelPending') }}</button>
      <template v-if="points.length >= 3">
        <span :class="maxResidual > 50 ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-400'">{{ t('overlay.maxResidual', { m: Math.round(maxResidual) }) }}</span>
        <label class="flex items-center gap-2">{{ t('overlay.opacity') }}
          <input v-model.number="opacity" type="range" min="0" max="100" step="5">
        </label>
      </template>
      <span v-else class="text-amber-700 dark:text-amber-300">{{ t('overlay.needThree') }}</span>
    </div>

    <ol v-if="points.length" class="mt-2 space-y-1 text-sm" data-point-list>
      <li v-for="(p, index) in points" :key="index" class="flex items-center gap-3">
        <span class="inline-grid h-5 w-5 place-items-center rounded-full bg-primary-600 text-xs text-white">{{ index + 1 }}</span>
        <span class="opacity-70">{{ Math.round(p.px) }}, {{ Math.round(p.py) }} px</span>
        <span v-if="pointResiduals[index] !== undefined" class="opacity-60">· {{ Math.round(pointResiduals[index]!) }} m</span>
        <button type="button" class="text-red-700 underline dark:text-red-300" @click="removePoint(index)">{{ t('overlay.removePoint') }}</button>
      </li>
    </ol>
  </div>
</template>
