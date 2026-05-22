// Busca de leads via webhook n8n — chamada direta do client.
// Função helper (não é mais um server function) para manter compatibilidade
// com o caller em src/routes/app.buscar.tsx.

import type { MockLead } from "@/data/mock-leads";

const N8N_WEBHOOK_URL =
  "https://matheuscrodrigues.app.n8n.cloud/webhook/zapscout-busca";

export type BuscarLeadsInput = {
  nicho: string;
  cidade: string;
  maxResultados?: number;
};

export type BuscarLeadsResult = {
  leads: MockLead[];
  error: string | null;
};

export async function buscarLeadsReais(
  input: BuscarLeadsInput,
): Promise<BuscarLeadsResult> {
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nicho: input.nicho,
        cidade: input.cidade,
        maxResultados: input.maxResultados ?? 20,
      }),
    });

    if (!res.ok) {
      return { leads: [], error: "Erro na busca. Tente novamente." };
    }

    const data = (await res.json()) as { leads?: MockLead[] };
    const leads = data.leads ?? [];

    return {
      leads,
      error: leads.length === 0 ? "Nenhum lead encontrado." : null,
    };
  } catch {
    return { leads: [], error: "Erro na busca. Tente novamente." };
  }
}
