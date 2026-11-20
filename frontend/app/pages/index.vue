<script setup lang="ts">
import { SessionCheck } from '@fsd/shared/ui/session-check';

definePageMeta({ middleware: 'session-entry' });
useSeoMeta({ robots: 'noindex' });
</script>

<template>
  <main>
    <SessionCheck />
  </main>
</template>
