import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

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
      '@': resolve(projectRoot, './src'),
      '@@': resolve(projectRoot, '.'),
    },
  },
  build: {
    // Preserve the browser targets used before upgrading from Vite 4.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    lib: {
      entry: {
        index: resolve(projectRoot, 'src/index.ts'),
        core: resolve(projectRoot, 'src/core/index.ts'),
        react: resolve(projectRoot, 'src/react/index.ts'),
        vue: resolve(projectRoot, 'src/vue/index.ts'),
        file: resolve(projectRoot, 'src/utils/file/validateFile.ts'),

        reactUseBrowserInfo: resolve(
          projectRoot,
          'src/react/useBrowserInfo.ts'
        ),
        reactUseCheckUpdate: resolve(
          projectRoot,
          'src/react/useCheckUpdate.ts'
        ),
        reactUseConcurrencyPool: resolve(
          projectRoot,
          'src/react/useConcurrencyPool.ts'
        ),
        reactUseConcurrencyPoolPro: resolve(
          projectRoot,
          'src/react/useConcurrencyPoolPro.ts'
        ),
        reactUseDebounce: resolve(projectRoot, 'src/react/useDebounce.ts'),
        reactUseEmpty: resolve(projectRoot, 'src/react/useEmpty.ts'),
        reactUseExcel: resolve(projectRoot, 'src/react/useExcel.ts'),
        reactUseExpandCollapse: resolve(
          projectRoot,
          'src/react/useExpandCollapse.ts'
        ),
        reactUseKeyboard: resolve(projectRoot, 'src/react/useKeyboard.ts'),
        reactUseMobileStyle: resolve(
          projectRoot,
          'src/react/useMobileStyle.ts'
        ),
        reactUseOnlineStatus: resolve(
          projectRoot,
          'src/react/useOnlineStatus.ts'
        ),
        reactUseSearchHistory: resolve(
          projectRoot,
          'src/react/useSearchHistory.ts'
        ),

        vueUseBrowserInfo: resolve(projectRoot, 'src/vue/useBrowserInfo.ts'),
        vueUseCheckUpdate: resolve(projectRoot, 'src/vue/useCheckUpdate.ts'),
        vueUseConcurrencyPool: resolve(
          projectRoot,
          'src/vue/useConcurrencyPool.ts'
        ),
        vueUseConcurrencyPoolPro: resolve(
          projectRoot,
          'src/vue/useConcurrencyPoolPro.ts'
        ),
        vueUseDebounce: resolve(projectRoot, 'src/vue/useDebounce.ts'),
        vueUseEmpty: resolve(projectRoot, 'src/vue/useEmpty.ts'),
        vueUseExcel: resolve(projectRoot, 'src/vue/useExcel.ts'),
        vueUseExpandCollapse: resolve(
          projectRoot,
          'src/vue/useExpandCollapse.ts'
        ),
        vueUseKeyboard: resolve(projectRoot, 'src/vue/useKeyboard.ts'),
        vueUseMobileStyle: resolve(projectRoot, 'src/vue/useMobileStyle.ts'),
        vueUseOnlineStatus: resolve(projectRoot, 'src/vue/useOnlineStatus.ts'),
        vueUseSearchHistory: resolve(
          projectRoot,
          'src/vue/useSearchHistory.ts'
        ),

        useBrowserInfo: resolve(projectRoot, 'src/hooks/useBrowserInfo.tsx'),
        useCheckUpdate: resolve(
          projectRoot,
          'src/utils/check/useCheckUpdate.tsx'
        ),
        useConcurrencyPool: resolve(
          projectRoot,
          'src/hooks/useConcurrencyPool.tsx'
        ),
        useConcurrencyPoolPro: resolve(
          projectRoot,
          'src/hooks/useConcurrencyPoolPro.tsx'
        ),
        useDebounce: resolve(projectRoot, 'src/hooks/useDebounce.ts'),
        useEmpty: resolve(projectRoot, 'src/hooks/useEmpty.tsx'),
        useExcel: resolve(projectRoot, 'src/hooks/useExcel.tsx'),
        useExpandCollapse: resolve(
          projectRoot,
          'src/hooks/useExpandCollapse.tsx'
        ),
        useKeyboard: resolve(projectRoot, 'src/hooks/useKeyboard.tsx'),
        useMobileStyle: resolve(projectRoot, 'src/hooks/useMobileStyle.tsx'),
        useOnlineStatus: resolve(projectRoot, 'src/hooks/useOnlineStatus.tsx'),
        useSearchHistory: resolve(
          projectRoot,
          'src/hooks/useSearchHistory.tsx'
        ),
      },
      name: 'rsshook',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
    rolldownOptions: {
      external: id =>
        externalPackages.some(pkg => id === pkg || id.startsWith(`${pkg}/`)),
      output: {
        exports: 'named',
      },
    },
    sourcemap: false,
    minify: 'oxc',
  },
  server: {
    port: 3000,
    open: true,
  },
});
