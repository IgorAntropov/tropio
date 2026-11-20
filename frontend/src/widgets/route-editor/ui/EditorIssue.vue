<script setup lang="ts">
import { useEditorCopy } from './presentation'

defineProps<{ issue: string, signInRequired?: boolean, compact?: boolean }>()
const { t } = useEditorCopy()
</script>

<template>
  <div class="editor-issue" :class="{ 'editor-form-issue': compact }">
    <p role="alert">{{ issue }}</p>
    <NuxtLink v-if="signInRequired" to="/login" target="_blank" rel="noopener" class="tk-button tk-button-text editor-reauth">
      {{ t('signInNewTab') }}
    </NuxtLink>
  </div>
</template>
