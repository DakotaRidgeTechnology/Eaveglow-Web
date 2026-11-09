import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-useless-assignment': 'off',
      'no-useless-assignment': 'off',
      'no-console': 'off',
    },
  },
  prettier,
  {
    ignores: ['dist/', 'node_modules/', 'e2e/shots/', '*.config.*'],
  },
);
