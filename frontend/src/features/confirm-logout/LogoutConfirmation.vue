<script setup lang="ts">
import {
  UiButton,
  UiDialog,
} from '@fsd/shared/ui/kit';

defineProps<{ pending?: boolean; error?: string }>();
const emit = defineEmits<{ confirm: [] }>();
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
</script>

<template>
  <UiDialog
    v-model="open"
    layout="confirmation"
    :persistent="pending"
    :title="t('identity.confirmLogout')"
  >
    <p class="logout-hint">{{ t('identity.logoutHint') }}</p>
    <p v-if="error" class="logout-error" role="alert">{{ error }}</p>
    <div class="logout-actions">
      <UiButton autofocus :disabled="pending" @click="open = false">{{ t('identity.stay') }}</UiButton>
      <UiButton class="tk-button-primary" :disabled="pending" @click="emit('confirm')">
        {{ t(pending ? 'identity.working' : 'identity.logout') }}
      </UiButton>
    </div>
  </UiDialog>
</template>

<style scoped>
.logout-hint, .logout-error { margin: 0; }
.logout-hint { color: var(--tk-muted); }
.logout-error { color: var(--tk-danger); font-size: var(--tk-text-sm); }
.logout-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--tk-space-2); }
</style>
