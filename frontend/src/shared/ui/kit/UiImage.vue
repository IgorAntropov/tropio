<script setup lang="ts">
import {
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import UiSkeleton from './UiSkeleton.vue';

defineProps<{ src: string; alt: string; fit?: 'contain' | 'cover' }>();
const image = useTemplateRef<HTMLImageElement>('image');
const state = ref<'loading' | 'ready' | 'error'>('loading');
const attempt = ref(0);

watch(image, async (element) => {
  if (!element) {
    return;
  }
  state.value = 'loading';
  try {
    await element.decode();
    if (image.value === element) {
      state.value = 'ready';
    }
  }
  catch {
    if (image.value === element) {
      state.value = 'error';
    }
  }
}, { flush: 'post' });

function retry() {
  attempt.value++;
}
</script>

<template>
  <span :aria-busy="alt && state === 'loading' ? true : undefined" class="tk-image">
    <img
      :key="attempt + ':' + src"
      ref="image"
      :alt="alt"
      :class="{ 'tk-image-ready': state === 'ready' }"
      decoding="async"
      :src="src"
      :style="{ objectFit: fit ?? 'cover' }"
    >
    <UiSkeleton v-if="state === 'loading'" class="tk-image-skeleton" />
    <slot v-if="state === 'error'" name="error" :retry="retry" />
  </span>
</template>

<style scoped>
.tk-image { position: relative; display: block; }
.tk-image img, .tk-image-skeleton { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
.tk-image img { display: block; visibility: hidden; }
.tk-image .tk-image-ready { visibility: visible; }
.tk-image-skeleton { border-radius: inherit; }
</style>
