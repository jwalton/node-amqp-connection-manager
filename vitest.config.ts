import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*Test.ts'],
        coverage: {
            include: ['src/**/*.ts'],
        },
    },
});
