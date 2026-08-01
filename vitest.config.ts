import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Playwright owns e2e/; vitest must not try to run those specs.
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The domain layer is the reason this project has tests at all.
      // Everything in it is pure and deterministic, so it is held to a high bar.
      include: ["domain/**/*.ts", "lib/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "domain/data/**"],
      thresholds: {
        "domain/**/*.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
  resolve: {
    alias: {
      // `import.meta.dirname`, not `__dirname`: Vite's native config loader
      // does not provide the CommonJS globals and warns about them today.
      "@": resolve(import.meta.dirname, "./"),
    },
  },
});
