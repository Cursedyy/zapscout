import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-representantes*.test.ts",
      "src/components/mimo-representantes*.test.tsx",
      // Porta de leitura do Omie compartilhada com o faturamento por representante.
      "src/lib/mimo-inadimplencia.server.test.ts",
    ],
    testTimeout: 30000,
  },
});
