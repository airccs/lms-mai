import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rename-html',
      generateBundle(options, bundle) {
        const htmlEntry = Object.keys(bundle).find(key => key.endsWith('.html'));
        if (htmlEntry) {
          const entry = bundle[htmlEntry];
          if (entry.type === 'asset') {
            delete bundle[htmlEntry];
            bundle['popup.html'] = {
              ...entry,
              fileName: 'popup.html',
            };
          }
        }
      },
    },
  ],
  build: {
    outDir: 'html',
    base: './',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: 'js/popup.js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) {
            return 'css/popup.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
    emptyOutDir: false,
  },
});
