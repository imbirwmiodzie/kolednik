import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const server = process.env.KOLEDNIK_SERVER ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': server,
      '/content': server,
      '/socket.io': { target: server, ws: true },
    },
  },
});
