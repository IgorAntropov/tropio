<script setup lang="ts">
const props = withDefaults(defineProps<{
  statusCode?: number;
  offline?: boolean;
  title?: string;
  description?: string;
  heading?: 'h1' | 'h2';
  page?: boolean;
}>(), {
  heading: 'h2',
  statusCode: 500,
  title: '',
  description: '',
});

const { t, locale } = useI18n();
const { baseURL } = useRuntimeConfig().app;
const headingId = useId();
const disconnected = ref(false);

function syncConnection() {
  disconnected.value = navigator.onLine === false;
}

onMounted(() => {
  syncConnection();
  window.addEventListener('offline', syncConnection);
  window.addEventListener('online', syncConnection);
});
onBeforeUnmount(() => {
  window.removeEventListener('offline', syncConnection);
  window.removeEventListener('online', syncConnection);
});

const kind = computed(() => {
  if (props.offline || (props.statusCode >= 500 && disconnected.value)) {
    return 'offline';
  }
  switch (props.statusCode) {
    case 400: return 'invalid';
    case 403: return 'forbidden';
    case 404:
    case 410: return 'notFound';
    case 429: return 'rateLimited';
    case 502:
    case 503:
    case 504: return 'unavailable';
    default: return 'unexpected';
  }
});

const illustrations = {
  invalid: 'map',
  notFound: 'map',
  forbidden: 'gate',
  rateLimited: 'lantern',
  unavailable: 'lantern',
  unexpected: 'lantern',
  offline: 'radio',
};
const art = computed(() => `${baseURL}system-pages/${illustrations[kind.value]}.webp`);
const title = computed(() => kind.value === 'offline' || !props.title ? t(`errors.${kind.value}`) : props.title);
const description = computed(() => kind.value === 'offline' || !props.description ? t(`errors.${kind.value}Hint`) : props.description);

useHead(() => ({
  link: [{ key: 'system-page-style', rel: 'stylesheet', href: `${baseURL}system-pages/screen.css` }],
  ...(props.page
    ? {
        title: t('pageTitle', { title: title.value }),
        htmlAttrs: { lang: locale.value },
        meta: [{ name: 'robots', content: 'noindex' }],
      }
    : {}),
}));
</script>

<template>
  <section :aria-labelledby="headingId" class="system-state" :class="{ 'system-state--page': page }">
    <img
      alt=""
      class="system-state-art"
      height="440"
      :src="art"
      width="600"
    >
    <div class="system-state-copy">
      <p v-if="kind !== 'offline'" class="system-state-code">{{ t('errors.code', { status: statusCode }) }}</p>
      <component :is="heading" :id="headingId" class="system-state-title">{{ title }}</component>
      <p class="system-state-description">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="system-state-actions"><slot /></div>
  </section>
</template>
