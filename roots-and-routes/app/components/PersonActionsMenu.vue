<script setup lang="ts">
// Right-click menu of a person: the same actions as the buttons (PersonActions.vue), from
// composables/usePersonActions.ts. Opens at the pointer, stays inside the window; closes on a choice, a click
// elsewhere, Esc, scrolling or resizing. Arrow keys move between the items.
import type { PersonEditor } from '~~/composables/usePersonEditor'
import { usePersonActions } from '~~/composables/usePersonActions'
import { useT } from '~~/composables/useT'

const props = defineProps<{
  editor?: PersonEditor | null
  personId: string
  // The person's name shown at the top of the menu
  title: string
  x: number
  y: number
  detail?: boolean
}>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'detail', id: string): void }>()
const { t } = useT()

const actions = usePersonActions({
  editor: props.editor,
  personId: () => props.personId,
  onDetail: props.detail ? id => emit('detail', id) : undefined,
})

const menu = ref<HTMLElement | null>(null)
const position = ref({ left: props.x, top: props.y })

const choose = (run: () => void) => {
  emit('close')
  run()
}

const items = () => [...(menu.value?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])]
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  event.preventDefault()
  const list = items()
  const index = list.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'ArrowDown' ? (index + 1) % list.length : (index - 1 + list.length) % list.length
  list[next]?.focus()
}
const onPointerDown = (event: PointerEvent) => { if (!menu.value?.contains(event.target as Node)) emit('close') }
const close = () => emit('close')

onMounted(async () => {
  await nextTick()
  const box = menu.value?.getBoundingClientRect()
  if (box) {
    const margin = 8
    position.value = {
      left: Math.max(margin, Math.min(props.x, window.innerWidth - box.width - margin)),
      top: Math.max(margin, Math.min(props.y, window.innerHeight - box.height - margin)),
    }
  }
  items()[0]?.focus()
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', close, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', close, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="actions.length"
      ref="menu"
      role="menu"
      :aria-label="title"
      class="fixed z-[1200] min-w-52 max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-xl dark:border-gray-700 dark:bg-gray-800"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      data-person-menu
      @contextmenu.prevent
    >
      <div class="truncate border-b border-gray-100 px-3 pb-1.5 pt-1 text-xs font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">{{ title }}</div>
      <template v-for="action in actions" :key="action.key">
        <div v-if="action.group === 'add'" class="mt-1 border-t border-gray-100 px-3 pb-0.5 pt-1.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">{{ t('tree.relation.add') }}</div>
        <button
          type="button"
          role="menuitem"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-gray-800 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:bg-gray-700"
          :disabled="action.disabled"
          :title="action.hint"
          :data-action="action.key"
          @click="choose(action.run)"
        >
          <span class="w-4 text-center" aria-hidden="true">{{ action.icon }}</span>{{ action.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>
