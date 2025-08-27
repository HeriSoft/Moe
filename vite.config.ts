
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API requests to our serverless function during development
    proxy: {
      '/api': {
        // Vercel dev server runs on port 3000 by default if you use `vercel dev`
        // Or you can point this to your running Node.js server file
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
