import nextPlugin from '@next/eslint-plugin-next'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@next/next': nextPlugin,
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Garde-fou i18n — la navigation native de Next ignore la locale.
      // Un `Link` importé de 'next/link' compile, s'affiche et fonctionne en
      // apparence : il perd simplement le préfixe /en, renvoyant un visiteur
      // anglophone au français au premier clic, sans la moindre erreur. Cette
      // règle transforme ce piège silencieux en échec de lint.
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'next/link',
            message: "Utiliser { Link } de '@/i18n/navigation' — next/link ignore la locale.",
          },
          {
            name: 'next/navigation',
            importNames: ['useRouter', 'usePathname', 'redirect', 'permanentRedirect'],
            message: "Utiliser '@/i18n/navigation' pour ces API — celles de Next ignorent la locale. useParams, useSearchParams et notFound restent à importer de 'next/navigation'.",
          },
        ],
      }],
    },
  },
  {
    // Seul endroit autorisé à toucher aux API natives : c'est lui qui les
    // enveloppe.
    files: ['src/i18n/navigation.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    ignores: ['.next/**', 'node_modules/**', '*.mjs', '*.cjs'],
  },
]

export default eslintConfig
