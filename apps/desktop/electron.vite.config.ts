import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: { outDir: 'out/main' },
  },
  preload: {
    // Sandboxed preloads must be CommonJS.
    build: {
      outDir: 'out/preload',
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: { outDir: 'out/renderer' },
    plugins: [react(), tailwindcss()],
  },
})
