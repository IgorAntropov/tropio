<script setup lang="ts">
import { PublicOrganizerPage } from '@fsd/pages/public-catalog';
definePageMeta({ key: route => route.path });
const route = useRoute();
</script>

<template><PublicOrganizerPage :id="String(route.params.id)" /></template>
