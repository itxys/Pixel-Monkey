import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import electronRenderer from 'vite-plugin-electron-renderer';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        electron({
          main: {
            entry: 'electron/main.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
                lib: {
                  entry: 'electron/main.ts',
                  formats: ['cjs'],
                  fileName: () => 'main.js',
                },
                rollupOptions: {
                  external: ['electron'],
                  output: {
                    format: 'cjs',
                  },
                },
              },
            },
          },
          preload: {
            input: {
              preload: 'electron/preload.ts',
            },
            vite: {
              build: {
                outDir: 'dist-electron',
                lib: {
                  entry: 'electron/preload.ts',
                  formats: ['cjs'],
                  fileName: () => 'preload.js',
                },
                rollupOptions: {
                  external: ['electron'],
                  output: {
                    format: 'cjs',
                  },
                },
              },
            },
          },
        }),
        electronRenderer(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
