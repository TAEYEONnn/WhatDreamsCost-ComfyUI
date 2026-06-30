import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@ltx-studio/shared-types": path.resolve(__dirname, "../../packages/shared-types/src"),
      "@ltx-studio/generation-core": path.resolve(__dirname, "../../packages/generation-core/src"),
    },
  },
});
