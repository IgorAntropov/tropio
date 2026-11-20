import codeStyle from '../eslint/style.mjs';
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  { ignores: ['.output-pages/**', 'src/shared/api/openapi.ts'] },
  codeStyle,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  {
    files: ['**/*.vue'],
    rules: {
      'vue/attributes-order': ['error', { alphabetical: true }],
      'vue/html-closing-bracket-newline': ['error', { singleline: 'never', multiline: 'always' }],
      'vue/html-closing-bracket-spacing': 'error',
      'vue/html-indent': ['error', 2],
      'vue/html-quotes': ['error', 'double'],
      'vue/max-attributes-per-line': ['error', { singleline: 3, multiline: 1 }],
      'vue/mustache-interpolation-spacing': 'error',
      'vue/no-multi-spaces': 'error',
      'vue/no-spaces-around-equal-signs-in-attribute': 'error',
    },
  },
);
