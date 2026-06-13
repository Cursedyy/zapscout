// Busca de leads via webhook n8n — agora encapsulada em server function
// autenticada para não expor a URL/credenciais do n8n no bundle do client
// nem permitir uso por chamadores não-autenticados (bypass de plano/rate-limit).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MockLead } from "@/data/mock-leads";
import { sanitizeSearchQuery } from "@/lib/sanitize";

const N8N_WEBHOOK_URL =
  "https://matheuscrodrigues.app.n8n.cloud/webhook/zapscout-busca";

const BuscarSchema = z.object({
  nicho: z.string().trim().min(1).max(200),
  cidade: z.string().trim().min(1).max(200),
  maxResultados: z.number().int().min(1).max(100).optional().default(20),
});

export type BuscarLeadsResult = {
  leads: MockLead[];
  error: string | null;
};

export const buscarLeadsReais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BuscarSchema.parse(input))
  .handler(async ({ data, context }): Promise<BuscarLeadsResult> => {
    // Rate limit: 30 buscas/hora por usuário (mesmo limite do fallback)
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ok = await checkRateLimit(`busca:${context.userId}`, 30, 3600, {
      eventType: "rate_limit_hit",
      identifier: context.userId,
    });
    if (!ok) {
      return {
        leads: [],
        error: "Limite de 30 buscas por hora atingido. Tente novamente mais tarde.",
      };
    }

    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nicho: sanitizeSearchQuery(data.nicho),
          cidade: sanitizeSearchQuery(data.cidade),
          maxResultados: data.maxResultados,
        }),
      });

      if (!res.ok) {
        return { leads: [], error: "Erro na busca. Tente novamente." };
      }

      const payload = (await res.json()) as { leads?: MockLead[] };
      const leads = payload.leads ?? [];

      return {
        leads,
        error: leads.length === 0 ? "Nenhum lead encontrado." : null,
      };
    } catch {
      return { leads: [], error: "Erro na busca. Tente novamente." };
    }
  });
