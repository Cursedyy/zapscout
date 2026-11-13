import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{include:['src/lib/mimo-comercial*.test.ts','src/components/mimo-comercial-numeros.test.tsx','src/components/mimo-lead-followups.test.tsx','src/lib/mimo-leads*.test.ts','src/lib/mimo-acesso.test.ts','src/lib/mimo-pedido*.test.ts','src/lib/mimo-tira*.test.ts'],testTimeout:60000}});