// Lint config for the Node packages (apps/api, packages/shared).
// apps/web has its own config with the React rules.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['**/dist', '**/node_modules', 'apps/web']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
  {
    // Tenant isolation: feature code must use the tenant-scoped client (request.auth.db).
    // Only bootstrap, health, auth (runs before a gym is known) and the db layer may touch the raw client.
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/app.ts',
      'apps/api/src/server.ts',
      'apps/api/src/seed.ts',
      'apps/api/src/db/**',
      'apps/api/src/plugins/auth.ts',
      'apps/api/src/routes/auth.ts',
      'apps/api/src/routes/health.ts',
      // Webhooks have no session: the payment they refer to decides the gym.
      'apps/api/src/routes/webhooks.ts',
      'apps/api/src/services/razorpay-webhook.ts',
      'apps/api/src/services/auth/**',
      'apps/api/src/services/health.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/db/unscoped'],
              message:
                'Use the tenant-scoped client (request.auth.db / TenantDb). The unscoped client can read every gym.',
            },
          ],
        },
      ],
    },
  },
])
