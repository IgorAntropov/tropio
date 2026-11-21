import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const defaultLocale = 'ru';
const pagesBaseURL = '/tropio/';

export default defineNuxtConfig({
  compatibilityDate: '2026-11-18',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint', '@nuxtjs/i18n'],
  i18n: {
    defaultLocale,
    locales: [{ code: defaultLocale, language: defaultLocale, file: 'ru.json' }],
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
  },
  css: ['@fsd/shared/styles/main.css'],
  routeRules: {
    '/': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/catalog': { headers: { 'cache-control': 'no-store' } },
    '/catalog/**': { headers: { 'cache-control': 'no-store' } },
    '/chats': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/organizers/**': { headers: { 'cache-control': 'no-store' } },
    '/feed': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/map': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/login': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/register': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/verify-email': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/request-password-reset': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/reset-password': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/profile': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/trips': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/trips/**': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
  },
  alias: {
    '@fsd': fileURLToPath(new URL('./src', import.meta.url)),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  hooks: {
    async 'nitro:config'(config) {
      if (!config.dev) {
        return;
      }

      const { localLoginPath, prefillLocalLogin } = await import('./server/utils/local-login-prefill.ts');
      config.devHandlers ??= [];
      config.devHandlers.push({
        route: localLoginPath,
        handler: event => prefillLocalLogin(event.node.req, event.node.res),
      });
    },
  },
  runtimeConfig: {
    bffBaseUrl: 'http://127.0.0.1:3001',
    bffProxySecret: '',
    public: { routeMapStyle: '', siteUrl: 'http://127.0.0.1:3000' },
  },
  app: {
    head: {
      htmlAttrs: { lang: defaultLocale },
      link: [{ key: 'favicon', rel: 'icon', href: '/favicon.ico?v=trulala' }],
    },
  },
  $env: {
    pages: {
      srcDir: 'demo/',
      serverDir: 'demo/server',
      app: {
        baseURL: pagesBaseURL,
        head: {
          link: [{ key: 'favicon', rel: 'icon', href: `${pagesBaseURL}favicon.ico?v=trulala` }],
        },
      },
      nitro: {
        prerender: { routes: ['/trips/'] },
        output: {
          dir: '.output-pages',
        },
      },
    },
  },
});
