import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		lib: {
			entry: './lib/index.ts',
			name: 'Storage',
			fileName: 'storage'
		},
		rollupOptions: {
			external: ['crypto-js'],
			output: {
				globals: {
					'crypto-js': 'crypto-js'
				}
			}
		}
	}
})
