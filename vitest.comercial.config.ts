import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{include:['src/lib/mimo-comercial*.test.ts','src/components/mimo-lead-followups.test.tsx','src/lib/mimo-leads*.test.ts','src/lib/mimo-acesso.test.ts'],testTimeout:60000}});