import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/uazapi.server.test.ts",
      "src/lib/mimo-whatsapp*.test.ts",
      "src/components/mimo-whatsapp*.test.tsx",
    ],
    testTimeout: 15000,
  },
});
