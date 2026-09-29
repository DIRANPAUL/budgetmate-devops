'use strict';

// ESLint v9 flat config — run by the Jenkins "Code Quality" stage via
// `npx eslint . -f checkstyle -o eslint-report.xml`. Deliberately strict on
// correctness (no-unused-vars, eqeqeq, no-var) while staying practical for
// a small Node service — this is the "structure, style and maintainability"
// pass the task sheet distinguishes from the separate Security stage.

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'test-results.xml'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'consistent-return': 'off',
      curly: ['error', 'multi-line'],
      'no-throw-literal': 'error',
    },
  },
];
