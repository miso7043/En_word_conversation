import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: `${(process.env.APP_BASE_PATH ?? '').replace(/\/$/, '')}/`,
  server: {
    proxy: { '/api': 'http://127.0.0.1:43871' },
  },
});
