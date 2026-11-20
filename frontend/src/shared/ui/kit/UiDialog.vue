<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

const open = defineModel<boolean>({ default: false })
const dialog = ref<HTMLDialogElement>()
const id = useId()
const visible = ref(false)
const props = defineProps<{ title: string, subtitle?: string, slide?: boolean }>()
const emit = defineEmits<{ closed: [] }>()
let generation = 0

watch([open, dialog], async ([requested, element]) => {
  const version = ++generation
  if (!element) return
  if (requested) {
    if (!element.open) {
      element.showModal()
      if (props.slide) element.getBoundingClientRect()
    }
    visible.value = true
    return
  }
  if (!element.open) return
  visible.value = false
  if (props.slide) {
    await nextTick()
    element.getBoundingClientRect()
    await Promise.allSettled(element.getAnimations().map(animation => animation.finished))
  }
  if (version === generation && !open.value) element.close()
}, { flush: 'post' })

function closed() {
  if (dialog.value?.open) return
  open.value = false
  visible.value = false
  emit('closed')
}
</script>

<template>
  <dialog ref="dialog" class="tk-dialog" :data-visible="visible || undefined" :aria-labelledby="id" @cancel.prevent="open = false" @close="closed">
    <div class="tk-dialog-inner">
      <header class="tk-dialog-header" :class="{ 'tk-dialog-header-centered': !subtitle }">
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
