<template>
  <span aria-hidden="true" class="tk-skeleton" />
</template>

<style scoped>
.tk-skeleton {
  display: block;
  min-inline-size: 0;
  block-size: 1em;
  border-radius: var(--tk-radius);
  background-color: var(--tk-raised);
}

@media (prefers-reduced-motion: no-preference) {
  .tk-skeleton {
    background-image: linear-gradient(100deg, transparent 30%, var(--tk-surface) 50%, transparent 70%);
    background-size: 240% 100%;
    animation: skeleton-sheen 2.4s ease-in-out infinite;
  }

  @keyframes skeleton-sheen {
    from { background-position: 100% 0; }
    to { background-position: -70% 0; }
  }
}
</style>
