import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const defaultLocale = 'ru'
const pagesBaseURL = '/tropio/'

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
    '/login': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/register': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/verify-email': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/request-password-reset': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/reset-password': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
    '/profile': { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } },
  },
  alias: {
    '@fsd': fileURLToPath(new URL('./src', import.meta.url)),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    bffBaseUrl: 'http://127.0.0.1:3001',
    bffProxySecret: '',
  },
  app: {
    head: {
      htmlAttrs: { lang: defaultLocale },
      link: [{ key: 'favicon', rel: 'icon', href: '/favicon.ico' }],
    },
  },
  $env: {
    pages: {
      srcDir: 'demo/',
      serverDir: 'demo/server',
      app: {
        baseURL: pagesBaseURL,
        head: {
          link: [{ key: 'favicon', rel: 'icon', href: `${pagesBaseURL}favicon.ico` }],
        },
      },
      nitro: {
        output: {
          dir: '.output-pages',
        },
      },
    },
  },
})
