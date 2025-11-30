import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rename-html',
      generateBundle(options, bundle) {
        // Переименовываем popup.html
        const popupHtml = Object.keys(bundle).find(key => key.includes('popup') && key.endsWith('.html'));
        if (popupHtml) {
          const entry = bundle[popupHtml];
          if (entry.type === 'asset') {
            delete bundle[popupHtml];
            bundle['popup.html'] = {
              ...entry,
              fileName: 'popup.html',
            };
          }
        }
        
        // Переименовываем saved-data.html
        const savedDataHtml = Object.keys(bundle).find(key => key.includes('saved-data') && key.endsWith('.html'));
        if (savedDataHtml) {
          const entry = bundle[savedDataHtml];
          if (entry.type === 'asset') {
            delete bundle[savedDataHtml];
            bundle['saved-data-react.html'] = {
              ...entry,
              fileName: 'saved-data-react.html',
            };
          }
        }
        
        // Переименовываем auto-scan.html
        const autoScanHtml = Object.keys(bundle).find(key => key.includes('auto-scan') && key.endsWith('.html'));
        if (autoScanHtml) {
          const entry = bundle[autoScanHtml];
          if (entry.type === 'asset') {
            delete bundle[autoScanHtml];
            bundle['auto-scan-react.html'] = {
              ...entry,
              fileName: 'auto-scan-react.html',
            };
          }
        }
      },
      transformIndexHtml(html) {
        // Заменяем абсолютные пути на относительные
        return html
          .replace(/src="\/js\//g, 'src="./js/')
          .replace(/href="\/css\//g, 'href="./css/')
          .replace(/href="\/js\//g, 'href="./js/');
      },
    },
  ],
  build: {
    outDir: 'html',
    base: './',
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/index.html'),
        savedData: resolve(__dirname, 'src/saved-data/index.html'),
        autoScan: resolve(__dirname, 'src/auto-scan/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'popup') return 'js/popup.js';
          if (chunkInfo.name === 'savedData') return 'js/saved-data-react.js';
          if (chunkInfo.name === 'autoScan') return 'js/auto-scan-react.js';
          return 'js/[name].js';
        },
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) {
            if (name.includes('saved-data')) return 'css/saved-data-react.css';
            if (name.includes('popup')) return 'css/popup.css';
            return 'css/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
      },
    },
    emptyOutDir: false,
  },
});
