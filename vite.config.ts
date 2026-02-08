import { defineConfig } from 'vite';

export default defineConfig({
  // other configurations
  define: {
    'process.env': {} // Mock process.env
  },
  // Fix environment variable handling
  plugins: [],
});