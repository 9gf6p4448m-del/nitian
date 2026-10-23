import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/nitian/',
  plugins: [react()],
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8', include: ['src/game/**/*.ts', 'src/storage.ts', 'src/duel-storage.ts'],
      exclude: ['src/**/*.test.ts', 'src/game/types.ts'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
})
