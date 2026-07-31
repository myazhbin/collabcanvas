import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Nothing under test touches the DOM — src/utils is pure by design, so no jsdom.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
