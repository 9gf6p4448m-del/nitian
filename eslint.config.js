import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'

// Scope this added check to the new mode and its shared PWA hook; legacy modes
// retain their existing regression suites rather than receiving unrelated edits.
export default [{
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
}, {
  files: ['src/FireApp.tsx', 'src/RealmApp.tsx', 'src/TacticsApp.tsx', 'src/fire/**/*.tsx', 'src/pwa.ts'],
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  plugins: { 'react-hooks': reactHooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
  },
}]
