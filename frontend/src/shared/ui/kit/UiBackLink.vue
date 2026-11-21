<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

const props = defineProps<{ to: RouteLocationRaw }>();
const router = useRouter();
const previous = ref<string>();
onMounted(() => {
  watch(router.currentRoute, () => {
    const path = router.options.history.state.back;
    previous.value = typeof path === 'string' ? path : undefined;
  }, { immediate: true });
});
const target = computed(() => {
  const destination = router.resolve(props.to);
  if (previous.value && destination.fullPath === destination.path && router.resolve(previous.value).path === destination.path) {
    return previous.value;
  }
  return props.to;
});

function follow(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }
  if (router.options.history.state.back === router.resolve(target.value).fullPath) {
    event.preventDefault();
    router.back();
  }
}
</script>

<template>
  <NuxtLink :to="target" @click.capture="follow"><slot /></NuxtLink>
</template>
