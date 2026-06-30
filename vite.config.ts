import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify("1.0.0"),
    __BUILD_ID__: JSON.stringify(new Date().getTime().toString()),
    __GIT_SHA__: JSON.stringify("production-deploy"),
    __DEPLOY_ENV__: JSON.stringify("production")
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')) return 'vendor-firebase';
          if (id.includes('node_modules/@stripe') || id.includes('node_modules/stripe')) return 'vendor-stripe';
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) return 'vendor-charts';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'vendor-pdf';
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/@tanstack') || id.includes('node_modules/react-router')) return 'vendor-core';
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
