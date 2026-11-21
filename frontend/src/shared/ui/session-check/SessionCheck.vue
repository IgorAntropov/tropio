<script setup lang="ts">
import { UiStatus } from '../kit';
import '../kit/kit.css';

const { t } = useI18n();
defineProps<{ message?: string }>();
</script>

<template>
  <div class="session-check">
    <UiStatus tone="pending">{{ message || t('workspace.sessionChecking') }}</UiStatus>
  </div>
</template>

<style scoped>
.session-check {
  position: fixed;
  inset: 0;
  display: grid;
  justify-items: center;
  align-content: center;
  padding: 24px;
}
</style>
