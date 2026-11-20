<script setup lang="ts">
import { WorkspaceFeed } from '@fsd/pages/workspace-feed'

definePageMeta({ layout: 'workspace', middleware: 'workspace' })

const { t } = useI18n()
useHead(() => ({
  title: t('pageTitle', { title: t('workspace.feed.title') }),
  meta: [{ name: 'robots', content: 'noindex' }],
}))
</script>

<template>
  <WorkspaceFeed />
</template>
