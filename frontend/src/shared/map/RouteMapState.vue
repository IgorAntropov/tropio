<script setup lang="ts">
import { UiSkeleton } from '@fsd/shared/ui/kit';

defineProps<{ skeleton?: boolean; error?: string }>();
</script>

<template>
  <UiSkeleton v-if="skeleton" class="route-map__skeleton" />
  <p class="route-map__message" :role="error ? 'alert' : 'status'">{{ error ?? 'Карта загружается…' }}</p>
</template>

<style scoped>
.route-map__skeleton {
  position: absolute;
  inset: 0;
  block-size: 100%;
  border-radius: 0;
}
.route-map__skeleton::after {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, var(--tk-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--tk-line) 1px, transparent 1px);
  background-position: center;
  background-size: 3.5rem 3.5rem;
  opacity: .38;
  content: '';
}
.route-map__message {
  position: absolute;
  top: 50%;
  left: 50%;
  width: max-content;
  max-width: calc(100% - 3rem);
  margin: 0;
  padding: .75rem 1rem;
  border: 1px solid #d5ddd6;
  border-radius: .75rem;
  color: #253b36;
  background: #f9fbf5;
  text-align: center;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
</style>
