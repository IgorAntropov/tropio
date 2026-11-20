import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

import codeStyle from './eslint/style.mjs';

export default defineConfig(
  { ignores: ['.*/', 'backend/', 'frontend/', 'docs/generated/', '**/dist/', '**/coverage/'] },
  { files: ['**/*.{ts,mts,cts}'], extends: [tseslint.configs.recommended] },
  codeStyle,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
);
