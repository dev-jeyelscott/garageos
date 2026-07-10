import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const invoicesSystemTimeSetup = fileURLToPath(
  new URL('./apps/api/src/test/invoices-system-time.setup.ts', import.meta.url),
);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [invoicesSystemTimeSetup],
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules', 'dist', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
