import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'node',
                    environment: 'node',
                    include: [
                        'core/**/*.test.ts',
                        'fixtures/**/*.test.ts',
                        'scripts/**/*.test.ts',
                        'tests/**/*.test.ts',
                        'server/**/*.test.ts',
                    ],
                },
            },
            {
                test: {
                    name: 'front',
                    environment: 'jsdom',
                    include: ['src/**/*.test.{ts,tsx}'],
                    setupFiles: ['src/lib/test/setup.ts'],
                },
            },
        ],
    },
});
