import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [react(), tailwindcss()],
  // Shared character modules live above game/, so resolve their Three.js
  // import from the game's dependency tree in clean monorepo builds.
  resolve: { dedupe: ['three'] },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
};
