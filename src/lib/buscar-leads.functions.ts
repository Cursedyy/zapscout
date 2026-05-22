import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca leads via Edge Function externa (Google Places API).
 * Endpoint já deployado em projeto Supabase dedicado.
 */

const InputSchema = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  raio: z.number().min(1).max(50).optional().default(15),
  semSite: z.boolean().optional().default(false),
  avaliacaoMin: z.number().min(0).max(5).optional().default(0),
  maxResultados: z.number().min(1).max(100).optional().default(20),
});

const FILTRAR_PUBLICOS = [
  "santa casa", "unidade de saúde", "unidade de saude",
  "ubs", "ups", "unidade básica", "unidade basica", "sus", "cras", "creas",
  "prefeitura", "secretaria", "governo", "municipal", "estadual",
  "federal", "escola pública", "escola publica", "hospital escola",
  "hospital universitário", "hospital universitario", "faculdade",
  "universidade", "ifrs", "ufpel", "ucpel", "posto de saúde",
  "posto de saude", "caps", "nasf", "upa", "pronto socorro",
];

const N8N_WEBHOOK_URL =
  "https://matheuscrodrigues.app.n8n.cloud/webhook/zapscout-busca";

type LeadOut = {
  id: string;
  nome: string;
  nicho: string;
  cidade: string;
  endereco: string;
  telefone: string;
  site: string | null;
  avaliacao: number;
  totalAvaliacoes: number;
  lat: number;
  lng: number;
  fonte: string;
};

type EdgeLead = {
  id?: string;
  nome?: string;
  endereco?: string;
  telefone?: string | null;
  site?: string | null;
  temSite?: boolean;
  avaliacao?: number;
  totalAvaliacoes?: number;
  lat?: number;
  lng?: number;
  fonte?: string;
};

type EdgeResponse = {
  leads?: EdgeLead[];
  error?: string | null;
};

function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55"))
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 12 && digits.startsWith("55"))
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits ? String(raw) : "";
}

function normalizeWebsite(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/facebook\.com|instagram\.com/i.test(s)) return null;
  return s.replace(/^https?:\/\//i, "").replace(/\/$/, "").split("/")[0];
}

export const buscarLeadsReais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);

      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${EDGE_FUNCTION_TOKEN}`,
          apikey: EDGE_FUNCTION_TOKEN,
        },
        body: JSON.stringify({
          nicho: data.nicho,
          cidade: data.cidade,
          maxResultados: data.maxResultados,
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Edge function ${res.status}: ${body.slice(0, 300)}`);
        return {
          leads: [] as LeadOut[],
          error: "Erro ao consultar o Google Maps. Tente novamente em instantes.",
        };
      }

      const payload = (await res.json()) as EdgeResponse;
      const raw = payload.leads ?? [];

      let out: LeadOut[] = raw
        .filter((p) => p.nome)
        .map((p, i): LeadOut => ({
          id: p.id ?? `gmap-${i}`,
          nome: String(p.nome).slice(0, 120),
          nicho: data.nicho,
          cidade: data.cidade,
          endereco: p.endereco ?? data.cidade,
          telefone: normalizePhone(p.telefone),
          site: normalizeWebsite(p.site ?? null),
          avaliacao: typeof p.avaliacao === "number" ? p.avaliacao : 0,
          totalAvaliacoes: typeof p.totalAvaliacoes === "number" ? p.totalAvaliacoes : 0,
          lat: p.lat ?? 0,
          lng: p.lng ?? 0,
          fonte: p.fonte ?? "Google Maps",
        }));

      let aviso: string | null = payload.error ?? null;

      out = out.filter((l) => {
        const nomeLower = l.nome.toLowerCase();
        return !FILTRAR_PUBLICOS.some((termo) => nomeLower.includes(termo));
      });

      if (data.avaliacaoMin > 0) {
        out = out.filter((l) => l.avaliacao >= data.avaliacaoMin);
      }

      if (data.semSite) {
        const filtrado = out.filter((l) => !l.site);
        if (filtrado.length === 0 && out.length > 0) {
          aviso = "Nenhum negócio sem site nesta busca — mostrando todos os resultados.";
        } else {
          out = filtrado;
        }
      }

      const seen = new Set<string>();
      out = out.filter((l) => {
        const key = `${l.nome.toLowerCase()}|${l.endereco.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      out = out.slice(0, data.maxResultados);

      return { leads: out, error: aviso };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = msg.includes("aborted") || msg.includes("AbortError");
      console.error("buscarLeadsReais (Edge Function) error:", msg);
      return {
        leads: [] as LeadOut[],
        error: isAbort
          ? "Tempo esgotado consultando o Google Maps. Tente um nicho mais específico."
          : "Erro ao buscar leads. Tente novamente em alguns segundos.",
      };
    }
  });
