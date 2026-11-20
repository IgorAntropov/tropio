<script setup lang="ts">
import { useEditorCopy } from './presentation';

defineProps<{ issue: string; signInRequired?: boolean; compact?: boolean }>();
const { t } = useEditorCopy();
</script>

<template>
  <div class="editor-issue" :class="{ 'editor-form-issue': compact }">
    <p role="alert">{{ issue }}</p>
    <NuxtLink
      v-if="signInRequired"
      class="tk-button tk-button-text editor-reauth"
      rel="noopener"
      target="_blank"
      to="/login"
    >
      {{ t('signInNewTab') }}
    </NuxtLink>
  </div>
</template>
