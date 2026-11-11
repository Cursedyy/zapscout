import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/lib/mimo-influenciadores*.test.ts",
      "src/components/mimo-influenciadores*.test.tsx",
    ],
    testTimeout: 30000,
  },
});
