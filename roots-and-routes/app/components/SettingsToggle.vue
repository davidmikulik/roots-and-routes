<script setup lang="ts">
defineProps<{ modelValue: boolean; label: string; description?: string; icon?: string; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()

const onChange = (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked)
</script>

<template>
  <label class="flex items-center justify-between gap-4" :class="disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'">
    <span class="flex items-center gap-3">
      <span v-if="icon">{{ icon }}</span>
      <span>
        <span class="block text-gray-900 dark:text-white">{{ label }}</span>
        <span v-if="description" class="block text-sm opacity-60 text-gray-600 dark:text-gray-400">{{ description }}</span>
      </span>
    </span>
    <span class="relative inline-flex items-center shrink-0">
      <input type="checkbox" class="sr-only peer" :checked="modelValue" :disabled="disabled" @change="onChange">
      <span class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-700 rounded-full peer-checked:bg-primary-600 dark:bg-gray-700 transition-colors"></span>
      <span class="absolute top-[2px] left-[2px] bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform peer-checked:translate-x-full peer-checked:border-white"></span>
    </span>
  </label>
</template>
