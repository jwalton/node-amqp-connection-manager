module.exports = {
    // Transforms tell jest how to process our non-javascript files.
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    // Tells Jest what folders to ignore for tests
    testPathIgnorePatterns: [`node_modules`, `\\.cache`],
    testMatch: ['**/test/**/*Test.ts'],
    collectCoverageFrom: ['**/src/**.ts', '!**/node_modules/**', '!**/vendor/**'],
    resolver: 'jest-ts-webcompat-resolver',
};
