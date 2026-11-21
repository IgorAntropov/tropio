<script setup lang="ts">
const props = withDefaults(defineProps<{
  alt: string;
  compact?: boolean;
  height?: number;
}>(), {
  height: 52,
});

const { baseURL } = useRuntimeConfig().app;
const width = computed(() => props.compact ? props.height : Math.round(props.height * 1672 / 941));
</script>

<template>
  <img
    :alt="alt"
    :height="height"
    :src="`${baseURL}${compact ? 'trulala-icon.svg' : 'trulala-logo.svg'}`"
    :width="width"
  >
</template>
