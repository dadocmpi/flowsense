import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import dyadComponentTagger from '@dyad-sh/react-vite-component-tagger';
import { twelveDataProxy } from './vite-plugins/twelvedata-proxy';

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [twelveDataProxy(), dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));