<script setup lang="ts">
import type { NuxtError } from '#app';
import { PageError } from '@fsd/shared/ui/page-error';

defineProps<{ error: NuxtError<{ retryPath?: unknown }> }>();
</script>

<template>
  <PageError :retry-path="error.data?.retryPath" :status-code="error.status ?? error.statusCode" />
</template>
