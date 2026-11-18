import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-18',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  alias: {
    '@fsd': fileURLToPath(new URL('./src', import.meta.url)),
  },
  runtimeConfig: {
    bffBaseUrl: 'http://127.0.0.1:3001',
  },
  app: {
    head: {
      title: 'Tropio',
      htmlAttrs: { lang: 'ru' },
    },
  },
  $env: {
    pages: {
      srcDir: 'demo/',
      serverDir: 'demo/server',
      app: {
        baseURL: '/tropio/',
      },
      nitro: {
        output: {
          dir: '.output-pages',
        },
      },
    },
  },
})
