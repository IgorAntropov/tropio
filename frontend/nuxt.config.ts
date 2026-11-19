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
  alias: {
    '@fsd': fileURLToPath(new URL('./src', import.meta.url)),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    bffBaseUrl: 'http://127.0.0.1:3001',
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
