import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    globals: true,
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        rootDir: '.',
        domEnvironment: 'happy-dom',
      },
    },
    include: ['app/**/__tests__/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['app/**/*.{vue,ts}'],
      exclude: ['app/**/__tests__/**'],
    },
  },
});
