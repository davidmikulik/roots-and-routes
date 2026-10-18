<script setup lang="ts">
// Canvas of the graphical tree: pan and zoom (d3-zoom handles mouse, wheel and touch), cards as HTML, connectors as one SVG.
// What a card shows comes in through the `card` slot; the chart only places it.
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { select } from 'd3-selection'
import { CARD_WIDTH, CARD_HEIGHT, UNIT_X, UNIT_Y, cardX, cardY, isUnknownPartner, type LayoutNode, type TreeLayout } from '~~/utils/gedcom/treeGraph'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  layout: TreeLayout
  rootId: string
  /** Accessible name of a card */
  cardLabel: (id: string) => string
}>()
const emit = defineEmits<{
  (event: 'select', id: string): void
  // Right click (or a long press, or the context menu key) on a person: the page opens its menu at x, y
  (event: 'context', value: { id: string; x: number; y: number }): void
}>()

const { t } = useT()

const MIN_SCALE = 0.05 // lets "fit" show even a very large tree
const MAX_SCALE = 2
const MARGIN = 24
const MOVE_TOLERANCE = 5 // px between press and release that still counts as a click

interface View { x: number; y: number; k: number }

const viewport = ref<HTMLElement | null>(null)
const view = shallowRef<View>({ x: 0, y: 0, k: 1 })

// Third-party objects stay out of deep reactivity (a Vue proxy around them breaks the library)
let behavior: ZoomBehavior<HTMLElement, unknown> | null = null
let observer: ResizeObserver | null = null
let animation = 0
let hasView = false
let userMoved = false
let anchor: { id: string; x: number; y: number } | null = null

const width = computed(() => props.layout.canvas.width * UNIT_X)
const height = computed(() => props.layout.canvas.height * UNIT_Y)
const connectorPath = computed(() =>
  props.layout.connectors.map(([x1, y1, x2, y2]) => `M${x1 * UNIT_X} ${y1 * UNIT_Y}L${x2 * UNIT_X} ${y2 * UNIT_Y}`).join(''),
)
// Changes only when something moved; a data refresh that yields the same picture must not reset the user's view
const signature = computed(() => props.layout.nodes.map(node => `${node.id}:${node.left},${node.top}`).join(';'))

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const applyView = (next: View) => {
  if (!viewport.value || !behavior) return
  behavior.transform(select(viewport.value), zoomIdentity.translate(next.x, next.y).scale(next.k))
}

const stopAnimation = () => cancelAnimationFrame(animation)

const animateTo = (target: View, duration = 300) => {
  stopAnimation()
  if (duration <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return applyView(target)
  const from = view.value
  const start = performance.now()
  const step = (now: number) => {
    const progress = clamp((now - start) / duration, 0, 1)
    const eased = 1 - (1 - progress) ** 3
    applyView({ x: from.x + (target.x - from.x) * eased, y: from.y + (target.y - from.y) * eased, k: from.k + (target.k - from.k) * eased })
    if (progress < 1) animation = requestAnimationFrame(step)
  }
  animation = requestAnimationFrame(step)
}

const size = () => ({ vw: viewport.value?.clientWidth ?? 0, vh: viewport.value?.clientHeight ?? 0 })

/** The whole tree inside the viewport; `minScale` stops it from becoming unreadably small */
const fitView = (minScale = MIN_SCALE): View => {
  const { vw, vh } = size()
  const k = clamp(Math.min((vw - 2 * MARGIN) / width.value, (vh - 2 * MARGIN) / height.value), minScale, 1)
  return { k, x: (vw - width.value * k) / 2, y: (vh - height.value * k) / 2 }
}

const centerOn = (node: LayoutNode | undefined, k: number): View => {
  const { vw, vh } = size()
  if (!node) return fitView()
  return { k, x: vw / 2 - (cardX(node.left) + CARD_WIDTH / 2) * k, y: vh / 2 - (cardY(node.top) + CARD_HEIGHT / 2) * k }
}
const rootNode = () => props.layout.nodes.find(node => node.id === props.rootId)

// First view: everything on screen when that stays readable, otherwise the root at a readable size
const initialView = (): View => {
  const { vw, vh } = size()
  const readable = vw < 600 ? 0.7 : 1
  const natural = Math.min((vw - 2 * MARGIN) / width.value, (vh - 2 * MARGIN) / height.value)
  return natural >= readable ? fitView() : centerOn(rootNode(), readable)
}

const ensureView = () => {
  if (!viewport.value || !behavior || !size().vw) return
  if (!hasView) {
    hasView = true
    applyView(initialView())
  } else if (!userMoved) {
    applyView(initialView())
  }
}

const zoomBy = (factor: number) => {
  if (viewport.value && behavior) behavior.scaleBy(select(viewport.value), factor)
}

const activate = (node: LayoutNode, event: Event) => {
  if (isUnknownPartner(node.id)) return
  if (node.id === props.rootId) {
    animateTo(centerOn(node, view.value.k))
    return
  }
  // Remember where the card is on screen so the new layout can start from the same spot and glide to the center
  const card = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const box = viewport.value!.getBoundingClientRect()
  anchor = { id: node.id, x: card.left + card.width / 2 - box.left, y: card.top + card.height / 2 - box.top }
  emit('select', node.id)
}

const openContext = (node: LayoutNode, event: MouseEvent) => {
  if (isUnknownPartner(node.id)) return
  // The context menu key gives no pointer position: open the menu at the card
  const card = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const fromKeyboard = event.clientX === 0 && event.clientY === 0
  emit('context', { id: node.id, x: fromKeyboard ? card.left + card.width / 2 : event.clientX, y: fromKeyboard ? card.bottom : event.clientY })
}

// Everyone in one family unit gets the same picture, so a new root must also move the view when no card changed place
watch([signature, () => props.rootId], async () => {
  await nextTick()
  if (!viewport.value || !behavior) return
  if (!hasView) return ensureView()
  const k = view.value.k
  const target = centerOn(rootNode(), k)
  const pending = anchor
  anchor = null
  const clicked = pending && props.layout.nodes.find(node => node.id === pending.id)
  if (pending && clicked) {
    const at = centerOn(clicked, k)
    // `at` centers the clicked card; shift it so the card keeps its place on screen first
    const { vw, vh } = size()
    applyView({ k, x: at.x + (pending.x - vw / 2), y: at.y + (pending.y - vh / 2) })
  }
  animateTo(target)
})

onMounted(() => {
  if (!viewport.value) return
  behavior = zoom<HTMLElement, unknown>()
    .scaleExtent([MIN_SCALE, MAX_SCALE])
    .clickDistance(MOVE_TOLERANCE)
    .filter((event: Event) => {
      const mouse = event as MouseEvent
      // Buttons over the canvas are not part of the pan area; Ctrl+wheel (pinch on trackpads) zooms like the plain wheel
      return !(event.target as Element).closest('[data-no-pan]') && (!mouse.ctrlKey || event.type === 'wheel') && !mouse.button
    })
    .on('zoom', (event) => {
      view.value = { x: event.transform.x, y: event.transform.y, k: event.transform.k }
      if (event.sourceEvent) userMoved = true
    })
  select(viewport.value).call(behavior).on('dblclick.zoom', null)
  ensureView()
  observer = new ResizeObserver(ensureView)
  observer.observe(viewport.value)
})

onBeforeUnmount(() => {
  stopAnimation()
  observer?.disconnect()
  if (viewport.value) select(viewport.value).on('.zoom', null)
})

defineExpose({ fit: () => animateTo(fitView()), zoomBy })

const controlClass = 'grid h-9 w-9 place-items-center rounded-lg border border-gray-300 bg-white text-lg leading-none text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
</script>

<template>
  <div
    ref="viewport"
    role="region"
    :aria-label="t('graph.canvas')"
    class="relative touch-none select-none overflow-hidden rounded-lg border border-gray-200 bg-[#f2f2f2] dark:border-gray-700 dark:bg-gray-900"
    @pointerdown="stopAnimation"
    @wheel.passive="stopAnimation"
  >
    <div
      class="absolute left-0 top-0 origin-top-left will-change-transform"
      :style="{ width: `${width}px`, height: `${height}px`, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }"
    >
      <svg :width="width" :height="height" class="pointer-events-none absolute left-0 top-0 overflow-visible" aria-hidden="true">
        <path :d="connectorPath" fill="none" stroke-width="1.5" class="stroke-gray-400 dark:stroke-gray-600" />
      </svg>

      <div
        v-for="node in layout.nodes"
        :key="node.id"
        :data-person-id="node.id"
        :data-root="node.id === rootId ? 'true' : undefined"
        :role="isUnknownPartner(node.id) ? undefined : 'button'"
        :tabindex="isUnknownPartner(node.id) ? undefined : 0"
        :aria-label="isUnknownPartner(node.id) ? undefined : cardLabel(node.id)"
        class="absolute rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        :class="isUnknownPartner(node.id) ? '' : 'cursor-pointer'"
        :style="{ left: `${cardX(node.left)}px`, top: `${cardY(node.top)}px`, width: `${CARD_WIDTH}px`, height: `${CARD_HEIGHT}px` }"
        @click="activate(node, $event)"
        @contextmenu.prevent="openContext(node, $event)"
        @keydown.enter.prevent="activate(node, $event)"
        @keydown.space.prevent="activate(node, $event)"
      >
        <slot name="card" :node="node" :is-root="node.id === rootId" />
      </div>

      <span
        v-for="couple in layout.couples"
        :key="couple.key"
        class="absolute z-10 grid h-9 w-9 place-items-center rounded-full border"
        :class="couple.divorced
          ? 'border-gray-300 bg-gray-200 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'
          : 'border-amber-300 bg-amber-100 text-amber-500 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-300'"
        :style="{ left: `${couple.x - 18}px`, top: `${couple.y - 26}px` }"
        :title="couple.divorced ? t('graph.divorced') : t('graph.married')"
      >
        <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="9" cy="14" r="5" />
          <circle cx="15" cy="14" r="5" />
          <path v-if="couple.divorced" d="M4 4l16 16" />
          <path v-else d="M12 3l1 2-1 1-1-1z" fill="currentColor" stroke="none" />
        </svg>
      </span>
    </div>

    <div data-no-pan class="absolute right-3 top-3 z-20 flex flex-col gap-2">
      <button type="button" :class="controlClass" :aria-label="t('graph.zoomIn')" :title="t('graph.zoomIn')" @click="zoomBy(1.3)">+</button>
      <button type="button" :class="controlClass" :aria-label="t('graph.zoomOut')" :title="t('graph.zoomOut')" @click="zoomBy(1 / 1.3)">−</button>
      <button type="button" :class="controlClass" :aria-label="t('graph.fit')" :title="t('graph.fit')" @click="animateTo(fitView())">⤢</button>
    </div>
  </div>
</template>
