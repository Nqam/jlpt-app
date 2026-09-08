import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Плоский конфиг ESLint 9.
 *
 * Главное здесь — не стилевые придирки, а инвариант браузерной безопасности:
 * `src/**` рендерится в браузере/renderer, поэтому оттуда НЕЛЬЗЯ импортировать
 * Node/Electron API. Правило `no-restricted-imports` делает это проверяемым,
 * а не «договорённостью на ревью». `shells/electron/**` и `scripts/**` — это
 * Node-код, там запрет снят.
 */
const nodeOnlyModules = ['electron', 'fs', 'fs/promises', 'path', 'child_process', 'os', 'crypto', 'module', 'url', 'util', 'stream'];

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      'resources/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.config.ts',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Браузерный код: инвариант + правила хуков React.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          paths: nodeOnlyModules.map((name) => ({
            name,
            message: 'src/** рендерится в браузере — Node/Electron API здесь запрещены (используйте PlatformAdapter).',
          })),
          patterns: [
            {
              group: ['node:*', 'electron/*'],
              message: 'src/** рендерится в браузере — Node/Electron API здесь запрещены (используйте PlatformAdapter).',
            },
          ],
        },
      ],
    },
  },
  {
    // Node-код: сборка контента, Electron main/preload, тесты.
    files: ['shells/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
