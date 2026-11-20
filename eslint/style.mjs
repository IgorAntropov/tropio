import stylistic from '@stylistic/eslint-plugin';
import perfectionist from 'eslint-plugin-perfectionist';

const style = stylistic.configs.customize({
  braceStyle: 'stroustrup',
  commaDangle: 'always-multiline',
  indent: 2,
  jsx: false,
  quotes: 'single',
  semi: true,
});

const namedSpecifiers = { singleLine: { maxItems: 1, spacing: 'always' } };

export default {
  name: 'tropio/code-style',
  files: ['**/*.{js,cjs,mjs,ts,cts,mts,vue}'],
  linterOptions: { noInlineConfig: true },
  plugins: { ...style.plugins, perfectionist },
  rules: {
    ...style.rules,
    '@stylistic/brace-style': ['error', 'stroustrup'],
    '@stylistic/exp-list-style': ['error', {
      overrides: {
        '()': 'off',
        '[]': 'off',
        '{}': 'off',
        '<>': 'off',
        'ExportNamedDeclaration': namedSpecifiers,
        'ImportDeclaration': namedSpecifiers,
        'ObjectExpression': { singleLine: { maxItems: 3, spacing: 'always' } },
      },
    }],
    '@stylistic/member-delimiter-style': 'error',
    'curly': ['error', 'all'],
    'perfectionist/sort-named-imports': 'error',
  },
};
