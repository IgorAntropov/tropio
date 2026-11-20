<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'small' | 'medium' | 'large'
  iconOnly?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  size: 'medium',
  type: 'button',
})
</script>

<template>
  <button :type="type" class="tk-button" :class="['tk-button-' + size, { 'tk-icon-button': iconOnly }]">
    <slot />
  </button>
</template>
