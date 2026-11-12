import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-frenet*.test.ts",
      "src/lib/mimo-frete*.test.ts",
      "src/lib/mimo-jadlog.test.ts",
      "src/lib/mimo-pedido*.test.ts",
      "src/lib/mimo-tira*.test.ts",
      "src/components/mimo-frete*.test.tsx",
      "src/components/mimo-tira-interface.test.tsx",
    ],
    testTimeout: 15000,
  },
});
