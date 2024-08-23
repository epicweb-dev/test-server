import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['./src/http.ts', './src/ws.ts'],
  outDir: './lib',
  format: ['esm'],
  dts: true,
  tsconfig: fileURLToPath(new URL('./tsconfig.build.json', import.meta.url)),
  clean: true,
  splitting: false,
  treeshake: true,
})
