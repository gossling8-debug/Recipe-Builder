import { defineConfig } from "vitest/config";

// The database security rules, tested against the Firestore emulator:
//   npm run test:rules   (starts the emulator, runs these, stops it)
export default defineConfig({
  test: {
    include: ["rules/**/*.rules.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
