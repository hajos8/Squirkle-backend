const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./test/setup.mjs'],
        include: ['test/**/*.test.mjs'],
        clearMocks: true,
        restoreMocks: true,
        mockReset: true,
    },
});
