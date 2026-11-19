<script setup lang="ts">
useSeoMeta({ robots: 'noindex' })
</script>

<template>
  <div class="demo-shell font-sans">
    <header class="demo-header demo-width flex items-center justify-between">
      <NuxtLink to="/" class="demo-wordmark">Tropio</NuxtLink>
      <span>Демо</span>
    </header>
    <NuxtPage />
  </div>
</template>

<style>
body {
  margin: 0;
}

.demo-shell {
  --ink: #142e2d;
  --muted: #4a6460;
  --paper: #f4f8f3;
  --line: #b4c5bb;
  --signal: #a03917;
  --focus: #146e62;
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-size: 16px;
  line-height: 1.6;
}

.demo-shell a {
  color: inherit;
  text-underline-offset: 0.22em;
}

.demo-shell a:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 4px;
}

.demo-width {
  width: min(100% - 3rem, 62rem);
  margin-inline: auto;
}

.demo-header {
  min-height: 4.5rem;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.demo-header .demo-wordmark {
  color: var(--ink);
  font-family: Georgia, serif;
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
}

.demo-main {
  padding-block: clamp(2.25rem, 6vw, 5rem);
}

.demo-main h1 {
  max-width: 15ch;
  margin: 0;
  font-family: Georgia, serif;
  font-size: clamp(2.4rem, 7vw, 5rem);
  font-weight: 400;
  line-height: 1.03;
  letter-spacing: -0.035em;
}

.demo-summary {
  max-width: 42ch;
  margin: 1.15rem 0 0;
  color: var(--muted);
}
</style>
