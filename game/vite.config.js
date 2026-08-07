import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
};
