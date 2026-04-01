/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mcpBridge from "./src/vite-plugin-mcp-bridge";

export default defineConfig({
  base: "/wassily/",
  plugins: [react(), mcpBridge()],
  test: {
    globals: true,
  },
});
