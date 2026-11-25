import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-pedidos*.test.ts",
      "src/components/mimo-painel-pedidos.test.tsx",
      "src/lib/mimo-tira-regras.test.ts",
      "src/components/mimo-tira-interface.test.tsx",
    ],
    testTimeout: 15000,
  },
});
