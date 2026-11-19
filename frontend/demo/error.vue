<script setup lang="ts">
import type { NuxtError } from '#app'
import { PageError } from '@fsd/shared/ui/page-error'

defineOptions({ name: 'DemoErrorPage' })

defineProps<{ error: NuxtError }>()
</script>

<template>
  <PageError :status-code="error.status ?? error.statusCode" />
</template>
