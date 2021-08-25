module.exports = {
    globals: {
        'ts-jest': {
            tsConfig: {
                target: 'es2019',
            },
        },
    },
    // Transforms tell jest how to process our non-javascript files.
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    // Tells Jest what folders to ignore for tests
    testPathIgnorePatterns: [`node_modules`, `\\.cache`],
    testURL: `http://localhost`,
    testMatch: ['**/test/**/*Test.ts'],
    collectCoverageFrom: ['**/src/**.ts', '!**/node_modules/**', '!**/vendor/**'],
    resolver: 'jest-ts-webcompat-resolver',
};
