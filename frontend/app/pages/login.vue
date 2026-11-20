<script setup lang="ts">
import { AccountAuthPage } from '@fsd/pages/account-auth'
import { loginReadyKey } from '@fsd/shared/session'
import { SessionCheck } from '@fsd/shared/ui/session-check'

definePageMeta({ middleware: 'session-entry' })
useSeoMeta({ robots: 'noindex' })

const loginReady = useState(loginReadyKey, () => false)
</script>

<template>
  <AccountAuthPage v-if="loginReady" mode="login" />
  <main v-else>
    <SessionCheck />
  </main>
</template>
