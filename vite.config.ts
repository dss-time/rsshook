import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

const externalPackages = ['react', 'react-dom', 'antd', 'axios', 'xlsx'];

export default defineConfig({
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@@': resolve(__dirname, '.'),
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        file: resolve(__dirname, 'src/utils/file/validateFile.ts'),
        useBrowserInfo: resolve(__dirname, 'src/hooks/useBrowserInfo.tsx'),
        useCheckUpdate: resolve(__dirname, 'src/utils/check/useCheckUpdate.tsx'),
        useConcurrencyPool: resolve(__dirname, 'src/hooks/useConcurrencyPool.tsx'),
        useConcurrencyPoolPro: resolve(
          __dirname,
          'src/hooks/useConcurrencyPoolPro.tsx'
        ),
        useDebounce: resolve(__dirname, 'src/hooks/useDebounce.ts'),
        useEmpty: resolve(__dirname, 'src/hooks/useEmpty.tsx'),
        useExcel: resolve(__dirname, 'src/hooks/useExcel.tsx'),
        useExpandCollapse: resolve(__dirname, 'src/hooks/useExpandCollapse.tsx'),
        useKeyboard: resolve(__dirname, 'src/hooks/useKeyboard.tsx'),
        useMobileStyle: resolve(__dirname, 'src/hooks/useMobileStyle.tsx'),
        useOnlineStatus: resolve(__dirname, 'src/hooks/useOnlineStatus.tsx'),
        useSearchHistory: resolve(__dirname, 'src/hooks/useSearchHistory.tsx'),
      },
      name: 'rsshook',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: id =>
        externalPackages.some(pkg => id === pkg || id.startsWith(`${pkg}/`)),
    },
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    port: 3000,
    open: true,
  },
});
