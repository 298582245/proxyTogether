import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/proxy': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) return 'echarts-vendor'
            if (id.includes('vue')) return 'vue-vendor'
            return 'vendor'
          }
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames(assetInfo) {
          const name = assetInfo.name || ''
          if (/\.css$/i.test(name)) return 'css/[name]-[hash][extname]'
          if (/\.(png|jpe?g|gif|svg|ico|webp)$/i.test(name)) return 'img/[name]-[hash][extname]'
          return 'other/[name]-[hash][extname]'
        }
      }
    }
  }
})
