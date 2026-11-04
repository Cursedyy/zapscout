import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Os fluxos de interface percorrem várias ações comerciais no mesmo cenário.
    testTimeout: 15_000,
    include: [
      "src/lib/use-mimo-preload.test.tsx",
      "src/lib/mimo-preload-dados.test.ts",
      "src/lib/mimo-query-options.test.ts",
      "src/components/mimo-tira-interface.test.tsx",
      "src/components/mimo-carteira-interface.test.tsx",
    ],
  },
});
