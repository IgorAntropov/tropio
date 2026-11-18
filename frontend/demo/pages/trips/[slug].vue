<script setup lang="ts">
import { demoTrips, TripDetails } from '@fsd/pages/demo-trips'

defineOptions({ name: 'DemoTripPage' })

definePageMeta({ key: route => route.path })

const route = useRoute()
const trip = demoTrips.find(item => item.slug === route.params.slug)

if (!trip) {
  throw createError({ statusCode: 404, statusMessage: 'Route not found' })
}

useSeoMeta({ title: `${trip.title} · Tropio` })
</script>

<template>
  <TripDetails :trip="trip" />
</template>
