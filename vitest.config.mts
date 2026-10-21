import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" wirft außerhalb von React Server Components – in Tests neutralisieren
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Tests laufen in Berlin-Zeit nicht zufällig richtig: Prozess-TZ bewusst auf UTC
    env: { TZ: "UTC" },
  },
});
