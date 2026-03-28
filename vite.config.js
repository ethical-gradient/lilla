// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        lilla: resolve(__dirname, 'src/index.js'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.${format}.js`
    },
    rollupOptions: { external: [], output: { globals: {} } },
    terserOptions: {
      ecma: 2020,
      module: true,

      compress: {
        passes: 3,
        pure_getters: true,
        pure_funcs: ['console.log', 'console.warn'],
        reduce_vars: true,
        reduce_funcs: true,
        sequences: true,
        conditionals: true,
        dead_code: true,
        evaluate: true,
        collapse_vars: true,
        join_vars: true,
        inline: 2,
      },

      mangle: {
        toplevel: true,
        reserved: [],
        properties: {
          regex: /^_/,
        },
      },

      format: {
        comments: false,
      },
    },
    minify: 'terser',
    target: 'es2020',
    sourcemap: false,
  }
});
