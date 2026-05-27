import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

const externalPackages = ['react', 'react-dom', 'vue', 'antd', 'axios', 'xlsx'];

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
        core: resolve(__dirname, 'src/core/index.ts'),
        react: resolve(__dirname, 'src/react/index.ts'),
        vue: resolve(__dirname, 'src/vue/index.ts'),
        file: resolve(__dirname, 'src/utils/file/validateFile.ts'),

        reactUseBrowserInfo: resolve(__dirname, 'src/react/useBrowserInfo.ts'),
        reactUseCheckUpdate: resolve(__dirname, 'src/react/useCheckUpdate.ts'),
        reactUseConcurrencyPool: resolve(
          __dirname,
          'src/react/useConcurrencyPool.ts'
        ),
        reactUseConcurrencyPoolPro: resolve(
          __dirname,
          'src/react/useConcurrencyPoolPro.ts'
        ),
        reactUseDebounce: resolve(__dirname, 'src/react/useDebounce.ts'),
        reactUseEmpty: resolve(__dirname, 'src/react/useEmpty.ts'),
        reactUseExcel: resolve(__dirname, 'src/react/useExcel.ts'),
        reactUseExpandCollapse: resolve(
          __dirname,
          'src/react/useExpandCollapse.ts'
        ),
        reactUseKeyboard: resolve(__dirname, 'src/react/useKeyboard.ts'),
        reactUseMobileStyle: resolve(__dirname, 'src/react/useMobileStyle.ts'),
        reactUseOnlineStatus: resolve(__dirname, 'src/react/useOnlineStatus.ts'),
        reactUseSearchHistory: resolve(
          __dirname,
          'src/react/useSearchHistory.ts'
        ),

        vueUseBrowserInfo: resolve(__dirname, 'src/vue/useBrowserInfo.ts'),
        vueUseCheckUpdate: resolve(__dirname, 'src/vue/useCheckUpdate.ts'),
        vueUseConcurrencyPool: resolve(
          __dirname,
          'src/vue/useConcurrencyPool.ts'
        ),
        vueUseConcurrencyPoolPro: resolve(
          __dirname,
          'src/vue/useConcurrencyPoolPro.ts'
        ),
        vueUseDebounce: resolve(__dirname, 'src/vue/useDebounce.ts'),
        vueUseEmpty: resolve(__dirname, 'src/vue/useEmpty.ts'),
        vueUseExcel: resolve(__dirname, 'src/vue/useExcel.ts'),
        vueUseExpandCollapse: resolve(
          __dirname,
          'src/vue/useExpandCollapse.ts'
        ),
        vueUseKeyboard: resolve(__dirname, 'src/vue/useKeyboard.ts'),
        vueUseMobileStyle: resolve(__dirname, 'src/vue/useMobileStyle.ts'),
        vueUseOnlineStatus: resolve(__dirname, 'src/vue/useOnlineStatus.ts'),
        vueUseSearchHistory: resolve(__dirname, 'src/vue/useSearchHistory.ts'),

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
      output: {
        exports: 'named',
      },
    },
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    port: 3000,
    open: true,
  },
});
