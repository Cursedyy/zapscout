import fs from "node:fs/promises";
import { parseEnv } from "node:util";
const env = parseEnv(await fs.readFile(".env", "utf8"));
const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) {
  console.log(JSON.stringify({ availability: "not_checked", reason: "public_config_missing" }));
} else {
  const headers = { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}) };
  await Promise.all([
    { name: "published_login", url: "https://zapscout.com.br/login" },
    { name: "auth_health", url: base + "/auth/v1/health", headers },
    { name: "auth_settings", url: base + "/auth/v1/settings", headers },
    { name: "database_empty_read", url: base + "/rest/v1/empresas?select=id&limit=0", headers },
  ].map(async ({ name, url, headers }) => {
    const start = Date.now();
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      const body = await response.text();
      console.log(JSON.stringify({ name, status: response.status, ms: Date.now() - start, bytes: body.length }));
    } catch (error) {
      console.log(JSON.stringify({ name, failure: error.name, ms: Date.now() - start }));
    }
  }));
}
// Read-only health diagnostics. Never attempt a password login or print bodies/keys.
