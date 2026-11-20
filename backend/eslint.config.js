import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

import codeStyle from '../eslint/style.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'local/dist/**', 'coverage/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  codeStyle,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
);
