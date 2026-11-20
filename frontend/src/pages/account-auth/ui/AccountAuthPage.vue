<script setup lang="ts">
import { identityApi, useIdentityAction } from '@fsd/shared/api'
import { workspaceHome, workspaceReturnPath } from '@fsd/shared/session'
import { AccountPanel } from '@fsd/shared/ui/account-panel'
import { useFormValidation } from '@fsd/shared/ui/form'
import { UiTextField } from '@fsd/shared/ui/kit'
import { isEmailAddress, passwordIssue } from '../validation'

const props = defineProps<{ mode: 'login' | 'register' | 'recovery' | 'verify' | 'reset' }>()
const { t } = useI18n()
const route = useRoute()

const prefilledEmail = useState('identity-recovery-email', () => '')
const email = ref(props.mode === 'recovery' ? prefilledEmail.value : '')
const password = ref('')
const showPassword = ref(false)
const acceptedTerms = ref(false)
const view = ref<'form' | 'sent' | 'done'>('form')
const token = ref('')
const findingToken = ref(props.mode === 'verify' || props.mode === 'reset')
const resent = ref(false)
const { pending, message, problem, reset, run } = useIdentityAction()
const needsEmail = computed(() => ['login', 'register', 'recovery'].includes(props.mode))
const needsPassword = computed(() => ['login', 'register', 'reset'].includes(props.mode))
const backToLogin = computed(() => props.mode === 'register' || props.mode === 'recovery')
const loginForm = useTemplateRef<HTMLFormElement>('loginForm')
let loginEdited = false
let developmentEmail: string | undefined

function trackLoginInput(event: Event) {
  if (import.meta.dev && props.mode === 'login') {
    loginEdited = true
    if (event.target instanceof HTMLInputElement && event.target.name === 'email') developmentEmail = undefined
  }
}

if (import.meta.dev && props.mode === 'login') {
  const request = new AbortController()
  onBeforeUnmount(() => request.abort())
  onMounted(async () => {
    const prefill = await $fetch<{ email: string; password: string } | undefined>('/api/dev/login-prefill', {
      signal: request.signal,
    }).catch(() => undefined)
    if (!prefill || request.signal.aborted || loginEdited || email.value || password.value) return

    const emailField = loginForm.value?.elements.namedItem('email')
    const passwordField = loginForm.value?.elements.namedItem('password')
    if (!(emailField instanceof HTMLInputElement) || !(passwordField instanceof HTMLInputElement)
      || emailField.value || passwordField.value) return

    developmentEmail = prefill.email
    email.value = developmentEmail
    password.value = prefill.password
  })
}

const invalidToken = computed(() => !findingToken.value &&
  (props.mode === 'verify' || props.mode === 'reset') && view.value !== 'done' &&
  (!token.value || (problem.value?.status === 422 && problem.value.code === 'INVALID_AUTH_TOKEN')))

const { valid, errors, touch, reset: resetValidation } = useFormValidation({
  email: () => needsEmail.value && !isEmailAddress(email.value) ? t('identity.emailError') : undefined,
  password: () => {
    if (!needsPassword.value) return undefined
    const issue = passwordIssue(password.value, props.mode === 'login' ? 1 : 12)
    return issue ? t(issue) : undefined
  },
  terms: () => props.mode === 'register' && !acceptedTerms.value ? t('identity.termsError') : undefined,
})

const title = computed(() => {
  if (invalidToken.value) return t('identity.invalidLink')
  if (view.value !== 'form') return t(`identity.${props.mode}.${view.value}Title`)
  return t(`identity.${props.mode}.title`)
})

useHead(() => ({
  title: t('pageTitle', { title: title.value }),
  meta: [
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ],
}))

onMounted(() => {
  if (props.mode === 'recovery') prefilledEmail.value = ''
  if (!findingToken.value) return

  const location = new URL(window.location.href)
  const linkToken = new URLSearchParams(location.hash.slice(1)).get('token') ?? location.searchParams.get('token')
  token.value = linkToken ?? ''
  location.hash = ''
  location.searchParams.delete('token')
  window.history.replaceState(window.history.state, '', location)
  findingToken.value = false
})

async function submit() {
  if (pending.value || invalidToken.value || !valid.value) return
  reset()
  const normalizedEmail = email.value.trim()
  const credentials = { email: normalizedEmail, password: password.value }

  switch (props.mode) {
    case 'login':
      if (await run(signal => identityApi.login(credentials, signal), () => { password.value = '' })) {
        await navigateTo(workspaceReturnPath(route.query.returnTo) ?? workspaceHome, { replace: true })
      }
      break
    case 'register':
      await run(signal => identityApi.register({ ...credentials, accepted_terms: true }, signal), () => {
        email.value = normalizedEmail
        password.value = ''
        showPassword.value = false
        resent.value = false
        view.value = 'sent'
      })
      break
    case 'recovery':
      await run(signal => identityApi.requestPasswordReset({ email: normalizedEmail }, signal), () => { view.value = 'sent' })
      break
    case 'verify':
      await run(signal => identityApi.verifyEmail({ token: token.value }, signal), () => {
        view.value = 'done'
        token.value = ''
      })
      break
    case 'reset':
      await run(signal => identityApi.resetPassword({ token: token.value, password: password.value }, signal), () => {
        view.value = 'done'
        password.value = ''
        token.value = ''
      })
      break
  }
}

async function resend() {
  resent.value = false
  await run(signal => identityApi.resendVerification({ email: email.value }, signal), () => { resent.value = true })
}

function editEmail() {
  reset()
  resetValidation()
  view.value = 'form'
}

function rememberEmail() {
  const address = email.value.trim()
  prefilledEmail.value = import.meta.dev && address === developmentEmail ? '' : address
}
</script>

<template>
  <AccountPanel :title="title" auth :back-to-login="backToLogin">
    <p v-if="findingToken" class="account-notice" role="status">{{ t('identity.loading') }}</p>
    <p v-else-if="invalidToken" class="account-notice">{{ t(`identity.${mode}.invalidHint`) }}</p>
    <div v-else-if="view === 'sent'" class="account-form">
      <p class="account-notice" role="status">{{ t(`identity.${mode}.sentHint`, { email }) }}</p>
      <p v-if="resent" class="account-notice" role="status">{{ t('identity.register.resent') }}</p>
      <div v-if="mode === 'register'" class="account-actions">
        <button class="tk-button" type="button" :disabled="pending" @click="editEmail">
          {{ t('identity.register.editEmail') }}
        </button>
        <button class="tk-button" type="button" :disabled="pending" @click="resend">
          {{ t(pending ? 'identity.working' : 'identity.register.resend') }}
        </button>
      </div>
    </div>
    <p v-else-if="view === 'done'" class="account-notice" role="status">{{ t(`identity.${mode}.doneHint`) }}</p>
    <form v-else ref="loginForm" class="account-form" novalidate :aria-busy="pending" @input="trackLoginInput" @submit.prevent="submit">
      <UiTextField
        v-if="needsEmail"
        v-model="email"
        :label="t('identity.email')"
        type="email"
        name="email"
        :autocomplete="mode === 'login' ? 'username' : 'email'"
        placeholder="name@example.com"
        :maxlength="254"
        :error="errors.email"
        :disabled="pending"
        required
        @blur="touch('email')"
      />
      <UiTextField
        v-if="needsPassword"
        v-model="password"
        :label="t(mode === 'reset' ? 'identity.reset.newPassword' : 'identity.password')"
        :type="showPassword ? 'text' : 'password'"
        name="password"
        :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :maxlength="256"
        :hint="mode === 'login' ? undefined : t('identity.passwordHint')"
        :error="errors.password"
        :disabled="pending"
        required
        @blur="touch('password')"
      >
        <template #trailing="{ inputId, disabled }">
          <button
            type="button" class="account-password-toggle"
            :aria-label="t(showPassword ? 'identity.hidePassword' : 'identity.showPassword')"
            :aria-controls="inputId" :disabled="disabled" @click="showPassword = !showPassword"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
              <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
              <circle cx="12" cy="12" r="2.5" />
              <path v-if="showPassword" d="m4 4 16 16" />
            </svg>
          </button>
        </template>
      </UiTextField>
      <div v-if="mode === 'register'" class="account-terms">
        <label class="account-check">
          <input
            v-model="acceptedTerms" type="checkbox" name="terms" :disabled="pending"
            :aria-invalid="errors.terms ? true : undefined" :aria-describedby="errors.terms ? 'terms-error' : undefined" required
            @blur="touch('terms')"
          >
          <span>{{ t('identity.register.terms') }} <span class="tk-required" aria-hidden="true">*</span></span>
        </label>
        <p v-if="errors.terms" id="terms-error" class="tk-field-error" role="alert">{{ errors.terms }}</p>
      </div>
      <p v-if="mode === 'verify'" class="account-notice">{{ t('identity.verify.hint') }}</p>
      <p v-if="message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
      <button class="tk-button tk-button-primary" type="submit" :disabled="pending || !valid">
        {{ t(pending ? 'identity.working' : `identity.${mode}.submit`) }}
      </button>
    </form>
    <p v-if="view === 'sent' && message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
    <nav v-if="!backToLogin" class="account-links" :aria-label="t('identity.navigation')">
      <template v-if="mode === 'login'">
        <NuxtLink to="/request-password-reset" @click="rememberEmail">{{ t('identity.recovery.forgot') }}</NuxtLink>
        <NuxtLink to="/register">{{ t('identity.register.submit') }}</NuxtLink>
      </template>
      <NuxtLink v-else to="/login">{{ t('identity.login.submit') }}</NuxtLink>
      <NuxtLink v-if="invalidToken && mode === 'reset'" to="/request-password-reset">{{ t('identity.reset.newLink') }}</NuxtLink>
      <NuxtLink v-if="invalidToken && mode === 'verify'" to="/register">{{ t('identity.verify.retry') }}</NuxtLink>
    </nav>
  </AccountPanel>
</template>
