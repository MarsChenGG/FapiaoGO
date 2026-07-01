import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { compression } from 'vite-plugin-compression2'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    compression({
      algorithms: ['gzip', 'brotliCompress'],
      threshold: 1024,
    }),
  ],
  publicDir: '../public',

  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../../electron/shared'),
    },
  },

  build: {
    target: 'es2020',
    // 代码分割优化
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-pdf') || id.includes('pdfjs-dist')) {
              return 'vendor-pdf'
            }
            if (id.includes('react-dom') || /[\\/]react[\\/]/.test(id)) {
              return 'vendor-react'
            }
            if (id.includes('react-dropzone') || id.includes('react-window')) {
              return 'vendor-utils'
            }
          }
        },
      },
    },
    // CSS 代码分割
    cssCodeSplit: true,
    // 压缩报告 & gzip/brotli 压缩
    reportCompressedSize: true,
    chunkSizeWarningLimit: 500,
    // 开启 CSS 代码压缩
    cssMinify: true,
    // 开启 JS 代码压缩（terser）
    minify: 'esbuild',
    // 移除注释
    removeComments: true,
  },

  // 依赖预构建优化
  // ✅ 预构建所有常用依赖，确保 CJS 模块正确转换为 ESM
  // ⚠️ react-pdf 和 pdfjs-dist 也需要预构建，否则 worker 配置会失败
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dropzone', 'react-window', 'warning', 'tiny-invariant', 'prop-types', 'react-pdf', 'pdfjs-dist'],
  },

  server: {
    fs: {
      strict: false
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/parse_invoice': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/get_pdf_pages': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/split_pdf': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
