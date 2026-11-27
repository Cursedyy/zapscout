import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-retorno-campanhas*.test.ts",
      "src/lib/mimo-campanhas-codigos*.test.ts",
      "src/components/mimo-retorno-campanhas-page.test.tsx",
      "src/components/mimo-retorno-codigos.test.tsx",
      "src/lib/mimo-comercial-paginacao.test.ts",
    ],
  },
});
