/// <reference types="vitest" />
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import mcpBridge from "./src/vite-plugin-mcp-bridge";

export default defineConfig({
  base: "/wassily/",
  plugins: [react(), mcpBridge()],
  test: {
    globals: true,
    exclude: [...configDefaults.exclude, ".claude/**"],
    // The solver research suites are CPU-heavy enough that parallel workers can
    // time out while reporting otherwise-passing results.
    fileParallelism: false,
  },
});
