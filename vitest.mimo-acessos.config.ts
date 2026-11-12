import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-acesso.test.ts",
      "src/lib/mimo-dashboard*.test.ts",
      "src/lib/mimo-agente.functions.test.ts",
      "src/lib/mimo-agente-db.test.ts",
      "src/lib/mimo-representantes*.test.ts",
      "src/components/mimo-dashboard-vendedor.test.tsx",
    ],
    testTimeout: 30000,
  },
});
