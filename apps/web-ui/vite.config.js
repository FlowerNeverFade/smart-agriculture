import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cp } from 'node:fs/promises';

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const runtimeVendorEntries = [
  'vue.global.prod.js',
  'echarts.min.js',
  'phosphor',
  'material-symbols',
  'README.md'
];

export default defineConfig({
  base: './',
  plugins: [{
    name: 'copy-local-runtime-vendor',
    async closeBundle() {
      for (const entry of runtimeVendorEntries) {
        await cp(`${webRoot}vendor/${entry}`, `${webRoot}dist/vendor/${entry}`, { recursive: true });
      }
    }
  }],
  assetsInclude: ['**/*.glb'],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL('./index.html', import.meta.url)),
        sysadmin: fileURLToPath(new URL('./sysadmin.html', import.meta.url)),
        farmer: fileURLToPath(new URL('./farmer.html', import.meta.url)),
        login: fileURLToPath(new URL('./login.html', import.meta.url)),
        horizon: fileURLToPath(new URL('./login-concepts.html', import.meta.url))
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/actuator': 'http://127.0.0.1:8080'
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 3000
  }
});
