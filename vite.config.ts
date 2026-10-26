import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		target: 'es2022',
		// A library ships unminified code with a source map: consumers can debug
		// the actual source, and their bundler does the minifying anyway.
		minify: false,
		sourcemap: true,
		lib: {
			entry: './lib/index.ts',
			name: 'CryptoStorageLite',
			formats: ['es', 'cjs', 'umd'],
			fileName: format => (format === 'es' ? 'storage.js' : format === 'cjs' ? 'storage.cjs' : 'storage.umd.cjs')
		}
	}
})
