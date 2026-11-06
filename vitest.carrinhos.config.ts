import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-carrinhos*.test.ts",
      "src/lib/mimo-recuperacao*.test.ts",
      "src/lib/mimo-nuvemshop*.test.ts",
      "src/lib/mimo-email*.test.ts",
      "src/lib/mimo-gmail*.test.ts",
      "src/components/mimo-carrinhos*.test.tsx",
    ],
    testTimeout: 60000,
  },
});
