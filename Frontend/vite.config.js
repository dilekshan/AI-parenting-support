import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Enable React support for the frontend development server and build.
export default defineConfig({
  plugins: [react()],
});
