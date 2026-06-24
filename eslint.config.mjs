import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
        },
      ],
    },
  },
];
