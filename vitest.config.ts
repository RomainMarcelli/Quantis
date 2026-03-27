import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // On execute les tests unitaires/integ sur toute l'application (hors E2E Playwright).
    include: [
      "lib/**/*.test.ts",
      "services/**/*.test.ts",
      "components/**/*.test.tsx",
      "app/**/*.test.ts",
      "tests/**/*.test.ts"
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
