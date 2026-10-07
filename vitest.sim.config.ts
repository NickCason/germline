import { defineConfig } from 'vitest/config';

// Balance simulations: headless runs of the real game loop with a bot player.
// Kept out of the normal test run because they are slow and print reports.
export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify('sim') },
  test: {
    environment: 'node',
    include: ['src/sim/**/*.sim.ts'],
    testTimeout: 600_000,
  },
});
