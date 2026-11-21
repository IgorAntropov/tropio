<script setup lang="ts">
import { WorkspacePlaceholder } from '@fsd/shared/ui/workspace-placeholder/index';

definePageMeta({ layout: 'workspace', middleware: 'workspace' });

const { t } = useI18n();
useHead(() => ({
  title: t('pageTitle', { title: t('workspace.chats') }),
  meta: [{ name: 'robots', content: 'noindex' }],
}));
</script>

<template>
  <WorkspacePlaceholder :label="t('workspace.chats')" />
</template>
