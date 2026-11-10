import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/whatsapp-grupos.test.ts",
      "src/lib/uazapi-webhook.test.ts",
      "src/lib/uazapi.server.test.ts",
      "src/lib/mimo-whatsapp-conexao*.test.ts",
      "src/lib/mimo-agente*.test.ts",
      "src/lib/mimo-ia-isolamento*.test.ts",
      "src/lib/mimo-webhook-regression.test.ts",
      "src/lib/mimo-whatsapp.server.test.ts",
      "src/components/mimo-agente*.test.tsx",
    ],
    testTimeout: 30000,
  },
});
