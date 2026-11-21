<script setup lang="ts">
import { WorkspacePage } from '../workspace-page/index';

defineProps<{ label: string }>();

const { t } = useI18n();
</script>

<template>
  <WorkspacePage :aria-label="label">
    <div class="workspace-placeholder-panel">
      <img
        alt=""
        height="464"
        src="./travel-notebook.webp"
        width="696"
      >
      <p>{{ t('workspace.comingSoon') }}</p>
    </div>
  </WorkspacePage>
</template>

<style scoped>
.workspace-placeholder-panel {
  display: grid;
  min-block-size: 100%;
  place-content: center;
  justify-items: center;
  gap: var(--tk-space-4);
  padding: var(--tk-space-4);
  text-align: center;
}

.workspace-placeholder-panel img {
  inline-size: min(100%, clamp(12rem, 24vw, 17rem), 45dvh);
  block-size: auto;
}

.workspace-placeholder-panel p {
  margin: 0;
  color: var(--tk-ink);
  font-size: clamp(1rem, 2vw, 1.25rem);
  font-weight: 600;
  text-wrap: balance;
}
</style>
