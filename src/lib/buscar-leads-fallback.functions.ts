// Server function de busca de leads com fallback em cascata:
// Fonte 1: Apify (compass/crawler-google-places)
// Fonte 2: SerpApi (engine=google_maps)
// Mantém o fluxo n8n existente intacto em src/lib/buscar-leads.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MockLead } from "@/data/mock-leads";
import { sanitizeSearchQuery } from "@/lib/sanitize";

// Conta do dono — sem teto de resultados por busca. Checado contra
// context.userId (autenticado server-side), não contra profiles.plano —
// mais direto e não depende de uma coluna que poderia mudar sem essa
// intenção de segurança em mente.
const DONO_USER_ID = "3f8d4e9b-990e-4723-b37a-10caf5902204";
const TETO_MAX_RESULTADOS_PADRAO = 200;

const BuscarFallbackSchema = z.object({
  nicho: z.string().trim().min(1, "Nicho é obrigatório").max(200, "Nicho muito longo"),
  cidade: z.string().trim().min(1, "Cidade é obrigatória").max(200, "Cidade muito longa"),
  // Teto do schema é só uma trava de sanidade (payload absurdo) — o teto de
  // segurança real (200 pra quem não é o dono) é aplicado no handler, onde
  // dá pra checar context.userId.
  maxResultados: z.number().int().min(1).max(5000).optional().default(50),
  semSite: z.boolean().optional().default(false),
  avaliacaoMin: z.number().min(0).max(5).optional().default(0),
  raioKm: z.number().min(1).max(100).optional().default(15),
});

type LeadComFonte = MockLead & { source: "apify" | "serpapi" };
type Geo = { lat: number; lng: number };

export type BuscarFallbackInput = z.infer<typeof BuscarFallbackSchema>;

export type BuscarFallbackResult = {
  leads: LeadComFonte[];
  source: "apify" | "serpapi" | null;
  error: string | null;
  totalBrutoFonte: number;
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

async function geocodeCidade(cidade: string): Promise<Geo | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade + ", Brasil")}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "ZapScout/1.0 (contato@zapscout.com.br)" },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as any[];
    if (!arr?.[0]) return null;
    return { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
  } catch {
    return null;
  }
}

// ---------- Fonte 1: Apify ----------
async function fetchApify(
  nicho: string,
  cidade: string,
  qtd: number,
  geo: Geo | null,
  raioKm: number,
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
      language: "pt-BR",
      ...(geo
        ? {
            customGeolocation: {
              type: "Point",
              coordinates: [geo.lng, geo.lat],
              radiusKm: raioKm,
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[apify-fallback] HTTP ${res.status}`, body);
    throw new Error(`Apify HTTP ${res.status}`);
  }
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
  geo: Geo | null,
): Promise<LeadComFonte[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY ausente");

  const q = encodeURIComponent(`${nicho} em ${cidade}`);
  const ll = geo ? `&ll=@${geo.lat},${geo.lng},13z` : "";
  const url = `https://serpapi.com/search?engine=google_maps&q=${q}${ll}&type=search&hl=pt-br&api_key=${key}`;
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
  .inputValidator((input) => BuscarFallbackSchema.parse(input))
  .handler(async ({ data, context }): Promise<BuscarFallbackResult> => {
    const nicho = sanitizeSearchQuery(data.nicho);
    const cidade = sanitizeSearchQuery(data.cidade);

    // Teto de resultados: dono sem limite, demais travados em
    // TETO_MAX_RESULTADOS_PADRAO — SEMPRE aplicado aqui (server), nunca
    // confia no valor que o client mandou além disso.
    const isDono = context.userId === DONO_USER_ID;
    const qtd = isDono ? data.maxResultados : Math.min(data.maxResultados, TETO_MAX_RESULTADOS_PADRAO);

    const semSite = data.semSite;
    const avaliacaoMin = data.avaliacaoMin;
    const raioKm = data.raioKm;

    const { isSiteProprio } = await import("@/lib/site-check");
    const filtrarSemSite = (leads: LeadComFonte[]) =>
      semSite ? leads.filter((l) => !isSiteProprio(l.site)) : leads;
    const filtrarAvaliacao = (leads: LeadComFonte[]) =>
      avaliacaoMin > 0 ? leads.filter((l) => l.avaliacao >= avaliacaoMin) : leads;

    if (!nicho || !cidade) {
      return { leads: [], source: null, error: "Nicho e cidade são obrigatórios.", totalBrutoFonte: 0 };
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
        totalBrutoFonte: 0,
      };
    }

    const geo = await geocodeCidade(cidade);

    // Fonte 1: Apify
    try {
      const bruto = await fetchApify(nicho, cidade, qtd, geo, raioKm);
      const leads = filtrarAvaliacao(filtrarSemSite(bruto));
      if (bruto.length > 0) {
        return { leads, source: "apify", error: null, totalBrutoFonte: bruto.length };
      }
      console.warn("[buscar-fallback] Apify retornou vazio, tentando SerpApi");
    } catch (err) {
      console.error("[buscar-fallback] Apify falhou:", err);
    }

    // Fonte 2: SerpApi
    try {
      const bruto = await fetchSerpApi(nicho, cidade, qtd, geo);
      const leads = filtrarAvaliacao(filtrarSemSite(bruto));
      return {
        leads,
        source: "serpapi",
        error: leads.length === 0 ? "Nenhum lead encontrado." : null,
        totalBrutoFonte: bruto.length,
      };
    } catch (err) {
      console.error("[buscar-fallback] SerpApi falhou:", err);
      return {
        leads: [],
        source: null,
        error: "Não foi possível buscar leads no momento. Tente novamente.",
        totalBrutoFonte: 0,
      };
    }
  });
