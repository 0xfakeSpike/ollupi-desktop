import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

/** The renderer's build, shared with vite.renderer.config.ts. */
export const renderer = {
  root: 'src/renderer',
  build: { outDir: 'out/renderer' },
  plugins: [react(), tailwindcss()],
}

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
  renderer,
})
