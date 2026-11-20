<script setup lang="ts">
import '@fsd/shared/ui/kit/kit.css';

const { t } = useI18n();
</script>

<template>
  <main aria-labelledby="feed-title" class="feed-page">
    <h1 id="feed-title">{{ t('workspace.feed.title') }}</h1>
    <div class="feed-empty">
      <div aria-hidden="true" class="feed-emblem">
        <svg
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2"
          viewBox="0 0 48 48"
        >
          <path d="M9 32c5 0 7-12 13-12s7 9 13 9h4M10 37h28" />
          <circle
            cx="10"
            cy="32"
            fill="var(--tk-surface)"
            r="3"
          />
          <circle
            cx="38"
            cy="29"
            fill="var(--tk-surface)"
            r="3"
          />
          <path d="M23 19s-5-5-5-9a5 5 0 1 1 10 0c0 4-5 9-5 9Z" />
          <circle
            cx="23"
            cy="10"
            fill="currentColor"
            r="1.4"
            stroke="none"
          />
        </svg>
      </div>
      <p>{{ t('workspace.feed.empty') }}</p>
      <div class="feed-actions">
        <NuxtLink class="tk-button tk-button-primary" to="/map">{{ t('workspace.feed.mapAction') }}</NuxtLink>
        <NuxtLink class="tk-button" to="/trips">{{ t('workspace.feed.tripsAction') }}</NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.feed-page {
  box-sizing: border-box;
  max-inline-size: 74rem;
  margin-inline: auto;
  padding: clamp(20px, 4vw, 50px);
  color: var(--tk-ink);
}

.feed-page h1 {
  margin: 0 0 clamp(16px, 3vw, 26px);
  font-size: clamp(1.85rem, 2.2vw + .65rem, 2.7rem);
  letter-spacing: -.04em;
  line-height: 1.1;
}

.feed-empty {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--tk-space-4);
  min-block-size: clamp(15rem, 34vh, 21rem);
  padding: clamp(22px, 5vw, 58px);
  border: 1px solid var(--tk-line);
  border-radius: var(--tk-radius-panel);
  background: var(--tk-surface);
  text-align: center;
}

.feed-emblem {
  display: grid;
  place-items: center;
  inline-size: 64px;
  block-size: 64px;
  border-radius: 18px;
  background: var(--tk-selected);
  color: var(--tk-accent);
}

.feed-emblem svg { inline-size: 44px; block-size: 44px; }
.feed-empty p { margin: 0; font-weight: 600; }

.feed-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--tk-space-2);
}

.feed-actions a { text-decoration: none; }

@media (max-width: 400px) {
  .feed-page { padding-inline: 16px; }
  .feed-empty { padding-inline: 14px; }
}
</style>
