<script setup lang="ts">
defineProps<{ label: string }>();

const { t } = useI18n();
</script>

<template>
  <main :aria-label="label" class="workspace-placeholder">
    <div class="workspace-placeholder-panel">
      <img
        alt=""
        height="464"
        src="./travel-notebook.webp"
        width="696"
      >
      <p>{{ t('workspace.comingSoon') }}</p>
    </div>
  </main>
</template>

<style scoped>
.workspace-placeholder {
  display: grid;
  min-block-size: var(--workspace-content-height);
  padding: var(--workspace-page-inset);
}

.workspace-placeholder-panel {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--tk-space-4);
  padding: var(--tk-space-4);
  background: #fcfdf9;
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

@media (min-width: 700px) {
  .workspace-placeholder-panel {
    border: 1px solid var(--tk-line);
    border-radius: var(--tk-radius-panel);
  }
}
</style>
