<script setup lang="ts">
import { isLoopbackHost } from '#shared/utils/loopback-host';
import {
  identityApi,
  useIdentityAction,
} from '@fsd/shared/api';
import {
  participationReturnPath,
  workspaceHome,
  workspaceReturnPath,
} from '@fsd/shared/session';
import { AccountPanel } from '@fsd/shared/ui/account-panel';
import { useFormValidation } from '@fsd/shared/ui/form';
import { UiTextField } from '@fsd/shared/ui/kit';
import {
  isEmailAddress,
  passwordIssue,
} from '../validation';

type Credentials = { email: string; password: string };
const props = defineProps<{
  mode: 'login' | 'register' | 'recovery' | 'verify' | 'reset';
  demoLogin?: { credentials: Credentials; signIn: (credentials: Credentials) => void; destination: string };
}>();
const { t } = useI18n();
const route = useRoute();
const resetFlow = props.mode === 'recovery' || props.mode === 'reset';
const emailLink = props.mode === 'verify' || props.mode === 'reset';
const emailLifetime = resetFlow ? 1800 : 3600;
const emailReturn = useCookie<{ path: string; expiresAt: number } | null>(
  resetFlow ? 'tropio_reset_return' : 'tropio_registration_return',
  { sameSite: 'lax', maxAge: emailLifetime, path: useRuntimeConfig().app.baseURL },
);
const returnTo = computed(() => {
  const explicit = workspaceReturnPath(route.query.returnTo);
  const saved = emailReturn.value;
  if (emailLink && !explicit && saved && saved.expiresAt > Date.now()) {
    return participationReturnPath(saved.path);
  }
  return explicit;
});

function authLink(path: string) {
  return returnTo.value ? path + '?' + new URLSearchParams({ returnTo: returnTo.value }).toString() : path;
}

function rememberReturn() {
  const path = participationReturnPath(returnTo.value);
  emailReturn.value = path ? { path, expiresAt: Date.now() + emailLifetime * 1000 } : null;
}

const prefilledEmail = useState('identity-recovery-email', () => '');
const email = ref(props.demoLogin?.credentials.email ?? (props.mode === 'recovery' ? prefilledEmail.value : ''));
const password = ref(props.demoLogin?.credentials.password ?? '');
const showPassword = ref(false);
const acceptedTerms = ref(false);
const view = ref<'form' | 'sent' | 'done'>('form');
const token = ref('');
const findingToken = ref(props.mode === 'verify' || props.mode === 'reset');
const resent = ref(false);
const { pending, message, problem, reset, run } = useIdentityAction();
const needsEmail = computed(() => ['login', 'register', 'recovery'].includes(props.mode));
const needsPassword = computed(() => ['login', 'register', 'reset'].includes(props.mode));
const backToLogin = computed(() => props.mode === 'register' || props.mode === 'recovery');
const loginForm = useTemplateRef<HTMLFormElement>('loginForm');
let loginEdited = false;
let testAccountEmail: string | undefined;

function trackLoginInput(event: Event) {
  if (props.mode === 'login') {
    loginEdited = true;
    if (event.target instanceof HTMLInputElement && event.target.name === 'email') {
      testAccountEmail = undefined;
    }
  }
}

if (props.mode === 'login' && !props.demoLogin) {
  const request = new AbortController();
  onBeforeUnmount(() => request.abort());
  onMounted(async () => {
    if (!isLoopbackHost(window.location.host)) {
      return;
    }
    const prefill = await $fetch<Credentials>('/api/dev/login-prefill', {
      signal: request.signal,
    }).catch(() => undefined);
    if (!prefill || request.signal.aborted || loginEdited || email.value || password.value) {
      return;
    }

    const emailField = loginForm.value?.elements.namedItem('email');
    const passwordField = loginForm.value?.elements.namedItem('password');
    if (!(emailField instanceof HTMLInputElement) || !(passwordField instanceof HTMLInputElement)
      || emailField.value || passwordField.value) {
      return;
    }

    testAccountEmail = prefill.email;
    email.value = prefill.email;
    password.value = prefill.password;
  });
}

const invalidToken = computed(() => !findingToken.value
  && (props.mode === 'verify' || props.mode === 'reset') && view.value !== 'done'
  && (!token.value || (problem.value?.status === 422 && problem.value.code === 'INVALID_AUTH_TOKEN')));

const { valid, errors, touch, reset: resetValidation } = useFormValidation({
  email: () => needsEmail.value && !isEmailAddress(email.value) ? t('identity.emailError') : undefined,
  password: () => {
    if (!needsPassword.value) {
      return undefined;
    }
    const issue = passwordIssue(password.value, props.mode === 'login' ? 1 : 12);
    return issue ? t(issue) : undefined;
  },
  terms: () => props.mode === 'register' && !acceptedTerms.value ? t('identity.termsError') : undefined,
});

const title = computed(() => {
  if (invalidToken.value) {
    return t('identity.invalidLink');
  }
  if (view.value !== 'form') {
    return t(`identity.${props.mode}.${view.value}Title`);
  }
  return t(`identity.${props.mode}.title`);
});

useHead(() => ({
  title: t('pageTitle', { title: title.value }),
  meta: [
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ],
}));

onMounted(() => {
  if (props.mode === 'recovery') {
    prefilledEmail.value = '';
  }
  if (!findingToken.value) {
    return;
  }

  const location = new URL(window.location.href);
  const linkToken = new URLSearchParams(location.hash.slice(1)).get('token') ?? location.searchParams.get('token');
  token.value = linkToken ?? '';
  location.hash = '';
  location.searchParams.delete('token');
  window.history.replaceState(window.history.state, '', location);
  findingToken.value = false;
});

async function signIn(credentials: Credentials, signal: AbortSignal) {
  if (props.demoLogin) {
    props.demoLogin.signIn(credentials);
  }
  else {
    await identityApi.login(credentials, signal);
  }
}

async function submit() {
  if (pending.value || invalidToken.value || !valid.value) {
    return;
  }
  reset();
  const normalizedEmail = email.value.trim();
  const credentials = { email: normalizedEmail, password: password.value };

  switch (props.mode) {
    case 'login':
      if (await run(signal => signIn(credentials, signal), () => {
        password.value = '';
      })) {
        await navigateTo(props.demoLogin?.destination ?? returnTo.value ?? workspaceHome, { replace: true });
      }
      break;
    case 'register':
      await run(signal => identityApi.register({ ...credentials, accepted_terms: true }, signal), () => {
        rememberReturn();
        email.value = normalizedEmail;
        password.value = '';
        showPassword.value = false;
        resent.value = false;
        view.value = 'sent';
      });
      break;
    case 'recovery':
      await run(signal => identityApi.requestPasswordReset({ email: normalizedEmail }, signal), () => {
        rememberReturn();
        view.value = 'sent';
      });
      break;
    case 'verify':
    case 'reset': {
      const target = returnTo.value ? authLink('/login') : undefined;
      const completed = await run(signal => props.mode === 'verify'
        ? identityApi.verifyEmail({ token: token.value }, signal)
        : identityApi.resetPassword({ token: token.value, password: password.value }, signal), () => {
        view.value = 'done';
        password.value = '';
        token.value = '';
      });
      if (completed) {
        emailReturn.value = null;
        if (target) {
          await navigateTo(target, { replace: true });
        }
      }
      break;
    }
  }
}

async function resend() {
  resent.value = false;
  await run(signal => identityApi.resendVerification({ email: email.value }, signal), () => {
    rememberReturn();
    resent.value = true;
  });
}

function editEmail() {
  reset();
  resetValidation();
  view.value = 'form';
}

function rememberEmail() {
  const address = email.value.trim();
  prefilledEmail.value = address === testAccountEmail ? '' : address;
}
</script>

<template>
  <AccountPanel
    auth
    :back-to-login="backToLogin"
    :catalog-link="demoLogin ? '/' : undefined"
    :class="{ 'account-surface-login': mode === 'login' }"
    :login-link="authLink('/login')"
    :title="title"
  >
    <p v-if="findingToken" class="account-notice" role="status">{{ t('identity.loading') }}</p>
    <p v-else-if="invalidToken" class="account-notice">{{ t(`identity.${mode}.invalidHint`) }}</p>
    <div v-else-if="view === 'sent'" class="account-form">
      <p class="account-notice" role="status">{{ t(`identity.${mode}.sentHint`, { email }) }}</p>
      <p v-if="resent" class="account-notice" role="status">{{ t('identity.register.resent') }}</p>
      <div v-if="mode === 'register'" class="account-actions">
        <button
          class="tk-button"
          :disabled="pending"
          type="button"
          @click="editEmail"
        >
          {{ t('identity.register.editEmail') }}
        </button>
        <button
          class="tk-button"
          :disabled="pending"
          type="button"
          @click="resend"
        >
          {{ t(pending ? 'identity.working' : 'identity.register.resend') }}
        </button>
      </div>
    </div>
    <p v-else-if="view === 'done'" class="account-notice" role="status">{{ t(`identity.${mode}.doneHint`) }}</p>
    <form
      v-else
      ref="loginForm"
      :aria-busy="pending"
      class="account-form"
      novalidate
      @input="trackLoginInput"
      @submit.prevent="submit"
    >
      <UiTextField
        v-if="needsEmail"
        v-model="email"
        :autocomplete="mode === 'login' ? 'username' : 'email'"
        :disabled="pending"
        :error="errors.email"
        :label="t('identity.email')"
        :maxlength="254"
        name="email"
        placeholder="name@example.com"
        required
        type="email"
        @blur="touch('email')"
      />
      <UiTextField
        v-if="needsPassword"
        v-model="password"
        :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        :disabled="pending"
        :error="errors.password"
        :hint="mode === 'login' ? undefined : t('identity.passwordHint')"
        :label="t(mode === 'reset' ? 'identity.reset.newPassword' : 'identity.password')"
        :maxlength="256"
        name="password"
        required
        :type="showPassword ? 'text' : 'password'"
        @blur="touch('password')"
      >
        <template #trailing="{ inputId, disabled }">
          <button
            :aria-controls="inputId"
            :aria-label="t(showPassword ? 'identity.hidePassword' : 'identity.showPassword')"
            class="account-password-toggle"
            :disabled="disabled"
            type="button"
            @click="showPassword = !showPassword"
          >
            <svg
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.7"
              viewBox="0 0 24 24"
            >
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
            v-model="acceptedTerms"
            :aria-describedby="errors.terms ? 'terms-error' : undefined"
            :aria-invalid="errors.terms ? true : undefined"
            :disabled="pending"
            name="terms"
            required
            type="checkbox"
            @blur="touch('terms')"
          >
          <span>{{ t('identity.register.terms') }} <span aria-hidden="true" class="tk-required">*</span></span>
        </label>
        <p
          v-if="errors.terms"
          id="terms-error"
          class="tk-field-error"
          role="alert"
        >{{ errors.terms }}</p>
      </div>
      <p v-if="mode === 'verify'" class="account-notice">{{ t('identity.verify.hint') }}</p>
      <p v-if="message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
      <button class="tk-button tk-button-primary" :disabled="pending || !valid" type="submit">
        {{ t(pending ? 'identity.working' : `identity.${mode}.submit`) }}
      </button>
    </form>
    <p v-if="view === 'sent' && message" class="account-notice account-notice-error" role="alert">{{ t(message) }}</p>
    <nav
      v-if="!demoLogin && mode !== 'recovery'"
      :aria-label="t('identity.navigation')"
      class="account-links"
      :class="{ 'account-login-prompt': mode === 'register' }"
    >
      <template v-if="mode === 'login'">
        <NuxtLink :to="authLink('/register')">{{ t('identity.register.submit') }}</NuxtLink>
        <NuxtLink :to="authLink('/request-password-reset')" @click="rememberEmail">{{ t('identity.recovery.forgot') }}</NuxtLink>
      </template>
      <template v-else>
        <span v-if="mode === 'register'">{{ t('identity.register.existingAccount') }}</span>
        <NuxtLink :to="authLink('/login')">{{ t('identity.login.submit') }}</NuxtLink>
      </template>
      <NuxtLink v-if="invalidToken && mode === 'reset'" :to="authLink('/request-password-reset')">{{ t('identity.reset.newLink') }}</NuxtLink>
      <NuxtLink v-if="invalidToken && mode === 'verify'" :to="authLink('/register')">{{ t('identity.verify.retry') }}</NuxtLink>
    </nav>
  </AccountPanel>
</template>
