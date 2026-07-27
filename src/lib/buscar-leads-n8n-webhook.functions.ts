// Busca de leads via webhook n8n novo (subdivisão por bairro, sem teto de 20/60
// do Apify/Places). Caminho ALTERNATIVO ao Apify — não substitui
// buscar-leads-fallback.functions.ts, só dá opção de comparar antes de trocar
// de vez. Ver app.buscar.tsx: botão "Buscar via n8n (beta)".

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MockLead } from "@/data/mock-leads";
import { sanitizeSearchQuery } from "@/lib/sanitize";

const N8N_LEADS_WEBHOOK_URL =
  "https://n8n.zapscout.com.br/webhook/78bc17d1-1d4c-4f4d-a6a5-f71f20824c8d";

// Busca por bairro é sequencial no n8n (1 request por bairro, com paginação
// interna) — pode levar minutos com muitos bairros. Timeout generoso pra não
// cortar buscas legítimas antes da hora.
const WEBHOOK_TIMEOUT_MS = 6 * 60 * 1000;

const BuscarN8nSchema = z.object({
  termo: z.string().trim().min(1, "Termo é obrigatório").max(200, "Termo muito longo"),
  cidade: z.string().trim().min(1, "Cidade é obrigatória").max(200, "Cidade muito longa"),
  bairros: z.string().trim().max(1000, "Lista de bairros muito longa").optional().default(""),
});

type N8nLeadRaw = {
  nome?: string;
  telefone?: string;
  endereco?: string;
  categoria?: string;
  site?: string | null;
  rating?: number | string;
  avaliacoes?: number | string;
  bairro?: string;
  termoBusca?: string;
};

export type BuscarN8nWebhookResult = {
  leads: MockLead[];
  error: string | null;
};

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeId(nome: string, idx: number) {
  return `n8n-webhook-${slug(nome).slice(0, 40)}-${idx}`;
}

// Formato real observado (2026-07-21, via curl direto no webhook): um único
// objeto flat, não array — o node de resposta no n8n está mandando só o
// primeiro item dos leads coletados (Response Data = "First entry JSON").
// Aceita os 3 formatos possíveis pra não quebrar se isso for corrigido lá:
// array flat, array envelopado em {json:{...}} (padrão n8n item), ou objeto
// único flat (caso atual).
function normalizeN8nPayload(payload: unknown): N8nLeadRaw[] {
  if (Array.isArray(payload)) {
    return payload.map((item) =>
      item && typeof item === "object" && "json" in (item as Record<string, unknown>)
        ? ((item as { json: N8nLeadRaw }).json ?? {})
        : (item as N8nLeadRaw),
    );
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.leads)) return obj.leads as N8nLeadRaw[];
    if ("json" in obj) return [(obj.json as N8nLeadRaw) ?? {}];
    if ("nome" in obj || "telefone" in obj) return [obj as N8nLeadRaw];
  }
  return [];
}

function mapLead(raw: N8nLeadRaw, cidade: string, termo: string, idx: number): MockLead {
  const nome = raw.nome ?? "Sem nome";
  return {
    id: makeId(nome, idx),
    nome,
    nicho: raw.termoBusca ?? termo,
    cidade,
    endereco: raw.endereco ?? "",
    telefone: raw.telefone ?? "",
    site: raw.site ?? null,
    avaliacao: Number(raw.rating ?? 0) || 0,
    totalAvaliacoes: Number(raw.avaliacoes ?? 0) || 0,
    lat: 0,
    lng: 0,
    source: "n8n",
  };
}

export const buscarLeadsN8nWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BuscarN8nSchema.parse(input))
  .handler(async ({ data, context }): Promise<BuscarN8nWebhookResult> => {
    // Mesma quota das outras fontes — não é um caminho pra burlar o rate limit.
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

    const termo = sanitizeSearchQuery(data.termo);
    const cidade = sanitizeSearchQuery(data.cidade);
    const bairros = sanitizeSearchQuery(data.bairros, 1000);

    if (!termo || !cidade) {
      return { leads: [], error: "Termo e cidade são obrigatórios." };
    }

    try {
      const res = await fetch(N8N_LEADS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termo, cidade, bairros }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[n8n-webhook] HTTP ${res.status}`, body);
        return { leads: [], error: "Erro na busca via n8n. Tente novamente." };
      }

      const rawText = await res.text();
      // DEBUG temporário — remover depois de confirmar que o n8n voltou a
      // mandar Response Data = "All Entries" (array com os 60 leads, não só 1).
      console.error(
        `[n8n-webhook] DEBUG status=${res.status} body=`,
        rawText.length > 500
          ? `${rawText.slice(0, 500)}…(truncado, ${rawText.length} chars)`
          : rawText,
      );

      let payload: unknown;
      try {
        payload = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("[n8n-webhook] JSON inválido na resposta:", parseErr, rawText.slice(0, 500));
        return { leads: [], error: "Resposta inválida da busca via n8n." };
      }

      const arr = normalizeN8nPayload(payload);
      const leads = arr.map((raw, i) => mapLead(raw, cidade, termo, i));

      return {
        leads,
        error: leads.length === 0 ? "Nenhum lead encontrado." : null,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      console.error("[n8n-webhook] falhou:", err);
      return {
        leads: [],
        error: isTimeout
          ? "Busca demorou demais (mais de 6 min). Tente reduzir o número de bairros."
          : "Erro na busca via n8n. Tente novamente.",
      };
    }
  });
