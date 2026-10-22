import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  build: {
    target: 'es2020',
    emptyOutDir: false,
    lib: {
      entry: `${root}/src/worker.ts`,
      formats: ['es'],
      fileName: () => 'worker.mjs',
    },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
