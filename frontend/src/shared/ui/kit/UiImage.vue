<script setup lang="ts">
import {
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import UiSkeleton from './UiSkeleton.vue';

defineProps<{ src: string; alt: string; fit?: 'contain' | 'cover'; loading?: 'lazy' | 'eager' }>();
const image = useTemplateRef<HTMLImageElement>('image');
const state = ref<'loading' | 'ready' | 'error'>('loading');
const attempt = ref(0);

async function reveal(element: HTMLImageElement) {
  if (image.value !== element) {
    return;
  }
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
}

watch(image, (element) => {
  state.value = 'loading';
  if (element?.complete) {
    void reveal(element);
  }
}, { flush: 'post' });

function retry() {
  attempt.value++;
}

function imageSettled(event: Event) {
  void reveal(event.currentTarget as HTMLImageElement);
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
      :loading="loading"
      :src="src"
      :style="{ objectFit: fit ?? 'cover' }"
      @error="imageSettled"
      @load="imageSettled"
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
@media (scripting: none) {
  .tk-image img { visibility: visible; }
  .tk-image .tk-image-skeleton { display: none; }
}
</style>
