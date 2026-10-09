import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `pnpm dev` sends /api to `vercel dev`, which serves the functions; its own page is blank locally (the CSP blocks Vite's inline dev scripts)
const API_TARGET = process.env.HOARDEX_API_URL ?? 'http://localhost:3000';

export default defineConfig({
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
    resolve: { tsconfigPaths: true },
    // xfwd: the sign-in must send Steam back to this server, not to vercel dev's blank page
    server: { proxy: { '/api': { target: API_TARGET, xfwd: true } } },
});
