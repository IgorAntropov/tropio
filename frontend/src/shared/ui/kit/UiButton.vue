<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'small' | 'medium' | 'large';
  iconOnly?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), {
  size: 'medium',
  type: 'button',
});
</script>

<template>
  <button class="tk-button" :class="['tk-button-' + size, { 'tk-icon-button': iconOnly }]" :type="type">
    <slot />
  </button>
</template>
