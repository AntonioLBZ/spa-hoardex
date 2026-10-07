import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['core/**/*.test.ts', 'fixtures/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts', 'api/**/*.test.ts'],
    },
});
