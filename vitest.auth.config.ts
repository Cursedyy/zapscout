import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/components/cadastro.test.tsx",
      "src/components/reset-password.test.tsx",
      "src/lib/auth-password-error.test.ts",
      "src/lib/auth-precheck.test.ts",
      "src/lib/login-lockout.server.test.ts",
    ],
  },
});
