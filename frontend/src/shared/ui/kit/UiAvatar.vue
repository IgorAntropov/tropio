<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

const props = defineProps<{
  name: string;
  src?: string;
  presence?: 'online' | 'offline';
}>();

const failed = ref(false);
watch(() => props.src, () => {
  failed.value = false;
});
const initials = computed(() => props.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('ru'));
const label = computed(() => [props.name, props.presence === 'online' ? 'в сети' : props.presence === 'offline' ? 'не в сети' : ''].filter(Boolean).join(', '));
</script>

<template>
  <span :aria-label="label" class="tk-avatar" role="img">
    <span aria-hidden="true" class="tk-avatar-image">
      <img
        v-if="src && !failed"
        alt=""
        :src="src"
        @error="failed = true"
      >
      <span v-else>{{ initials }}</span>
    </span>
    <span
      v-if="presence"
      aria-hidden="true"
      class="tk-presence"
      :data-presence="presence"
    />
  </span>
</template>
