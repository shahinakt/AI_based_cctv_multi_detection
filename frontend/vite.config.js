import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure esbuild treats .js files that contain JSX as JSX during dependency scanning
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        // treat plain .js files as jsx so esbuild can parse JSX syntax in .js files
        '.js': 'jsx',
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.jsx': 'jsx'
      }
    }
  },
})
