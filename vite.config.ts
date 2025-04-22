import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  console.log(`Building in ${mode} mode with base path: '/remote-bt-assist/'`);
  
  return {
    // Always use the repo name as base path for GitHub Pages
    base: '/remote-bt-assist/',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      assetsInlineLimit: 4096,
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    server: {
      host: "0.0.0.0", // Allow external access from other devices
      port: 8080,
      strictPort: true,
      open: true, // Automatically open browser
      hmr: {
        // Enable HMR for external devices
        // Don't specify host here - let Vite determine it automatically
        port: 8080,
        protocol: "ws",
      },
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
