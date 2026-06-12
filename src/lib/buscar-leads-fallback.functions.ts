// Server function de busca de leads com fallback em cascata:
// Fonte 1: Apify (compass/crawler-google-places)
// Fonte 2: SerpApi (engine=google_maps)
// Mantém o fluxo n8n existente intacto em src/lib/buscar-leads.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MockLead } from "@/data/mock-leads";
import { sanitizeSearchQuery } from "@/lib/sanitize";

const BuscarFallbackSchema = z.object({
  nicho: z.string().trim().min(1, "Nicho é obrigatório").max(200, "Nicho muito longo"),
  cidade: z.string().trim().min(1, "Cidade é obrigatória").max(200, "Cidade muito longa"),
  maxResultados: z.number().int().min(1).max(100).optional().default(20),
});

type LeadComFonte = MockLead & { source: "apify" | "serpapi" };

export type BuscarFallbackInput = {
  nicho: string;
  cidade: string;
  maxResultados?: number;
};

export type BuscarFallbackResult = {
  leads: LeadComFonte[];
  source: "apify" | "serpapi" | null;
  error: string | null;
};

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeId(prefix: string, nome: string, idx: number) {
  return `${prefix}-${slug(nome).slice(0, 40)}-${idx}`;
}

// ---------- Fonte 1: Apify ----------
async function fetchApify(
  nicho: string,
  cidade: string,
  qtd: number,
): Promise<LeadComFonte[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN ausente");

  const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchStringsArray: [`${nicho} em ${cidade}`],
      maxCrawledPlacesPerSearch: qtd,
      language: "pt",
    }),
  });

  if (!res.ok) throw new Error(`Apify HTTP ${res.status}`);
  const arr = (await res.json()) as any[];
  if (!Array.isArray(arr)) throw new Error("Apify: resposta inválida");

  return arr.map((p, i) => ({
    id: makeId("apify", p.title ?? p.name ?? "lead", i),
    nome: p.title ?? p.name ?? "Sem nome",
    nicho,
    cidade,
    endereco: p.address ?? p.street ?? "",
    telefone: p.phone ?? p.phoneUnformatted ?? "",
    site: p.website ?? null,
    avaliacao: Number(p.totalScore ?? p.rating ?? 0) || 0,
    totalAvaliacoes: Number(p.reviewsCount ?? p.user_ratings_total ?? 0) || 0,
    lat: Number(p.location?.lat ?? 0) || 0,
    lng: Number(p.location?.lng ?? 0) || 0,
    source: "apify" as const,
  }));
}

// ---------- Fonte 2: SerpApi ----------
async function fetchSerpApi(
  nicho: string,
  cidade: string,
  qtd: number,
): Promise<LeadComFonte[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY ausente");

  const q = encodeURIComponent(`${nicho} em ${cidade}`);
  const url = `https://serpapi.com/search?engine=google_maps&q=${q}&type=search&hl=pt-br&api_key=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi HTTP ${res.status}`);

  const data = (await res.json()) as any;
  const results: any[] = data.local_results ?? data.place_results ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("SerpApi: sem resultados");
  }

  return results.slice(0, qtd).map((r, i) => ({
    id: makeId("serpapi", r.title ?? "lead", i),
    nome: r.title ?? "Sem nome",
    nicho,
    cidade,
    endereco: r.address ?? "",
    telefone: r.phone ?? "",
    site: r.website ?? null,
    avaliacao: Number(r.rating ?? 0) || 0,
    totalAvaliacoes: Number(r.reviews ?? 0) || 0,
    lat: Number(r.gps_coordinates?.latitude ?? 0) || 0,
    lng: Number(r.gps_coordinates?.longitude ?? 0) || 0,
    source: "serpapi" as const,
  }));
}

// ---------- Server function exposta ao client ----------
export const buscarLeadsFallback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BuscarFallbackInput) => input)
  .handler(async ({ data, context }): Promise<BuscarFallbackResult> => {
    const nicho = sanitizeSearchQuery(data.nicho);
    const cidade = sanitizeSearchQuery(data.cidade);
    const qtd = Math.min(Math.max(data.maxResultados ?? 20, 1), 100);

    if (!nicho || !cidade) {
      return { leads: [], source: null, error: "Nicho e cidade são obrigatórios." };
    }

    // Rate limit: 30 buscas/hora por usuário
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    const ok = await checkRateLimit(`busca:${context.userId}`, 30, 3600, {
      eventType: "rate_limit_hit",
      identifier: context.userId,
    });
    if (!ok) {
      return {
        leads: [],
        source: null,
        error: "Limite de 30 buscas por hora atingido. Tente novamente mais tarde.",
      };
    }


    // Fonte 1: Apify
    try {
      const leads = await fetchApify(nicho, cidade, qtd);
      if (leads.length > 0) {
        return { leads, source: "apify", error: null };
      }
      console.warn("[buscar-fallback] Apify retornou vazio, tentando SerpApi");
    } catch (err) {
      console.error("[buscar-fallback] Apify falhou:", err);
    }

    // Fonte 2: SerpApi
    try {
      const leads = await fetchSerpApi(nicho, cidade, qtd);
      return {
        leads,
        source: "serpapi",
        error: leads.length === 0 ? "Nenhum lead encontrado." : null,
      };
    } catch (err) {
      console.error("[buscar-fallback] SerpApi falhou:", err);
      return {
        leads: [],
        source: null,
        error: "Não foi possível buscar leads no momento. Tente novamente.",
      };
    }
  });
