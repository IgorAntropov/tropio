<script setup lang="ts">
import {
  onMounted,
  ref,
  watchEffect,
} from 'vue';
import UiButton from './UiButton.vue';
import UiSkeleton from './UiSkeleton.vue';

const props = defineProps<{
  cursor: string;
  loading: boolean;
  paused?: boolean;
  root?: HTMLElement | null;
}>();
const emit = defineEmits<{ more: [] }>();
const { t } = useI18n();
const end = ref<HTMLElement>();
const automatic = ref(true);

onMounted(() => {
  automatic.value = typeof IntersectionObserver !== 'undefined';
  watchEffect((onCleanup) => {
    const target = end.value;
    const cursor = props.cursor;
    if (!automatic.value || !target || props.paused || props.loading) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && cursor === props.cursor && !props.loading && !props.paused) {
        observer.disconnect();
        emit('more');
      }
    }, { root: props.root ?? null, rootMargin: '0px 0px 140px' });
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  }, { flush: 'post' });
});
</script>

<template>
  <div ref="end" class="tk-scroll-pagination">
    <div v-if="loading" class="tk-scroll-progress" role="status">
      <UiSkeleton />
      <span class="tk-sr-only">{{ t('pagination.loading') }}</span>
    </div>
    <UiButton
      v-else
      :class="{ 'tk-scroll-manual': automatic }"
      :disabled="paused"
      @click="emit('more')"
    >{{ t('pagination.more') }}</UiButton>
  </div>
</template>

<style scoped>
.tk-scroll-pagination { position: relative; display: grid; justify-items: center; min-block-size: 1px; }
.tk-scroll-progress { inline-size: min(14rem, 80%); padding-block: var(--tk-space-3); }
.tk-scroll-progress > .tk-skeleton { block-size: .5rem; }
.tk-scroll-manual:not(:focus-visible) { position: absolute; inline-size: 1px; block-size: 1px; min-block-size: 0; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
