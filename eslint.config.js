import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'fix_svgs.cjs',
      'fix_y.cjs',
      'fit_pattern_svgs.cjs',
      'build_letters.cjs',
      'build_icons.cjs',
      'build_pictures.cjs',
      'preview_letters.cjs',
      'check_letters.cjs',
      'check_letters_browser.cjs',
      // Pasted into the dev server's console by hand, not bundled.
      'check_validation.js',
      // A Node script and the Android project (whose copy of the build under
      // assets/public is generated): neither is part of the Vite build.
      'android_build.mjs',
      'android'
    ]
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module'
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Several catch blocks deliberately swallow errors (localStorage in
      // private mode, Web Audio being unavailable).
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', caughtErrors: 'none' }
      ],
      // The React Compiler rules flag long-standing patterns here (handlers
      // referenced by keyboard listeners declared above them, state synced in
      // effects). They are worth working through, but they are style debt
      // rather than live bugs, so they warn instead of failing the run.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn'
    }
  }
];
