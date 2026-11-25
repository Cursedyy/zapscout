import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-rastreamento*.test.ts",
      "src/components/mimo-rastreamento-page.test.tsx",
      "src/lib/mimo-acesso.test.ts",
    ],
    testTimeout: 15_000,
  },
});
