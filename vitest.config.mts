import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["node_modules/**"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/core/**"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  },
  resolve: {
    alias: {
      "@/core": path.resolve(import.meta.dirname, "src/core"),
      "@/infra": path.resolve(import.meta.dirname, "src/infrastructure"),
      "@/composition": path.resolve(import.meta.dirname, "src/composition"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
