import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    root: '.',
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './frontend'),
            '@components': path.resolve(__dirname, './frontend/components'),
            '@features': path.resolve(__dirname, './frontend/features'),
            '@store': path.resolve(__dirname, './frontend/store'),
            '@hooks': path.resolve(__dirname, './frontend/hooks'),
            '@theme': path.resolve(__dirname, './frontend/theme'),
            '@utils': path.resolve(__dirname, './frontend/utils'),
        },
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    motion: ['framer-motion'],
                    state: ['zustand'],
                },
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
});
