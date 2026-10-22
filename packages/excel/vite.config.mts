import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  build: {
    target: 'es2020',
    lib: {
      entry: {
        index: `${root}/src/index.ts`,
        browser: `${root}/src/browser.ts`,
        react: `${root}/src/react.ts`,
      },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rolldownOptions: {
      external: id =>
        ['xlsx', 'react'].some(p => id === p || id.startsWith(`${p}/`)),
      output: { exports: 'named' },
    },
  },
});
