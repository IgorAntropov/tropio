<script setup lang="ts">
defineProps<{ single?: boolean }>();
</script>

<template>
  <div class="profile-scroll" data-scroll-region="profile">
    <div class="profile-layout" :class="{ 'profile-layout-single': single }">
      <div class="profile-personal"><slot name="personal" /></div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.profile-scroll { --profile-pad: clamp(1rem, 2.15vw, 2rem); flex: 1; min-block-size: 0; overflow: auto; overscroll-behavior: contain; padding: var(--profile-pad); }
.profile-layout { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: var(--profile-pad); min-block-size: 100%; }
.profile-personal { display: flex; flex-direction: column; gap: var(--tk-space-5); min-inline-size: 0; padding-inline-end: var(--profile-pad); border-inline-end: 1px solid var(--tk-line); }
@media (max-width: 960px) {
  .profile-layout { grid-template-columns: minmax(0, 1fr); align-content: start; }
  .profile-personal { padding: 0 0 var(--profile-pad); border: 0; border-block-end: 1px solid var(--tk-line); }
}
.profile-layout-single { grid-template-columns: minmax(0, 1fr); }
.profile-layout-single .profile-personal { max-inline-size: 44rem; padding: 0; border: 0; }
</style>
