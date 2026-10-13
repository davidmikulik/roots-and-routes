<script setup lang="ts">
// Wraps content and shows a small bubble above it on hover or keyboard/touch focus.
// Without `text` it renders just the content (no bubble, not focusable).
defineProps<{ text?: string }>()

const bubble = ref<HTMLElement | null>(null)
// Horizontal correction so the bubble never leaves the screen (e.g. a chip near the right edge of a phone)
const shift = ref(0)

const reposition = async () => {
  shift.value = 0
  await nextTick()
  const rect = bubble.value?.getBoundingClientRect()
  if (!rect) return
  const margin = 8
  if (rect.left < margin) shift.value = margin - rect.left
  else if (rect.right > window.innerWidth - margin) shift.value = window.innerWidth - margin - rect.right
}
</script>

<template>
  <span
    class="group relative inline-block outline-none"
    :tabindex="text ? 0 : undefined"
    @mouseenter="text && reposition()"
    @focus="text && reposition()"
  >
    <slot />
    <span
      v-if="text"
      ref="bubble"
      role="tooltip"
      class="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[14rem] rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 dark:bg-gray-100 dark:text-gray-900"
      :style="{ transform: `translateX(calc(-50% + ${shift}px))` }"
    >
      {{ text }}
      <span
        class="absolute left-1/2 top-full border-4 border-transparent border-t-gray-900 dark:border-t-gray-100"
        :style="{ transform: `translateX(calc(-50% - ${shift}px))` }"
      ></span>
    </span>
  </span>
</template>
