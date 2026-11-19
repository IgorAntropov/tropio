<script setup lang="ts">
import { ref, useId, watch } from 'vue'

const open = defineModel<boolean>({ default: false })
const dialog = ref<HTMLDialogElement>()
const id = useId()

defineProps<{ title: string, subtitle?: string }>()

watch([open, dialog], ([visible, element]) => {
  if (visible && element && !element.open) element.showModal()
  if (!visible && element?.open) element.close()
}, { flush: 'post' })
</script>

<template>
  <dialog ref="dialog" class="tk-dialog" :aria-labelledby="id" @close="open = false">
    <div class="tk-dialog-inner">
      <header class="tk-dialog-header">
        <div>
          <h2 :id="id">{{ title }}</h2>
          <p v-if="subtitle" class="tk-muted">{{ subtitle }}</p>
        </div>
        <button class="tk-button tk-icon-button" type="button" aria-label="Закрыть" @click="open = false"><span aria-hidden="true">×</span></button>
      </header>
      <slot />
    </div>
  </dialog>
</template>
