import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

const shared = fileURLToPath(new URL('../src/shared', import.meta.url));

export default defineNuxtConfig({
  compatibilityDate: '2026-11-19',
  devtools: { enabled: false },
  css: [`${shared}/styles/main.css`, `${shared}/ui/kit/kit.css`],
  alias: { '@kit': `${shared}/ui/kit/index.ts` },
  vite: { plugins: [tailwindcss()] },
  nitro: {
    publicAssets: [{ dir: fileURLToPath(new URL('../public', import.meta.url)) }],
  },
  app: {
    head: {
      title: 'UI-kit · Трулала',
      htmlAttrs: { lang: 'ru' },
      meta: [{ name: 'robots', content: 'noindex' }],
      link: [{ rel: 'icon', href: '/favicon.ico?v=trulala' }],
    },
  },
});
