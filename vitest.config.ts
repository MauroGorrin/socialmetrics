import path from 'path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Playwright specs under tests/e2e/ use their own runner (`pnpm test:e2e`);
    // Vitest must not try to collect them. The blueprint bundle and the
    // _Contexto/ reference repos sit in the tree but are not the app.
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'blueprints/**', '_Contexto/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
