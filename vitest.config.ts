import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // On execute aussi les tests de composants premium (SSR statique react-dom/server).
    include: ["lib/**/*.test.ts", "services/**/*.test.ts", "components/**/*.test.tsx"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
});
