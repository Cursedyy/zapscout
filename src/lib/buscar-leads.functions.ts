import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca leads reais via Google Places API (New) através do gateway Lovable.
 * Mantém o shape do tipo MockLead para compatibilidade com a UI.
 */

const InputSchema = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  semSite: z.boolean().optional().default(false),
  avaliacaoMin: z.number().min(0).max(5).optional().default(0),
  maxResultados: z.number().min(1).max(100).optional().default(20),
});

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
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

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
  if (/google\.com|maps\.google|business\.google/i.test(s)) return null;
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
}

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
};

export const buscarLeadsReais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return { leads: [] as LeadOut[], error: "Integração Google Maps não configurada." };
    }

    const textQuery = `${data.nicho} em ${data.cidade}`;
    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.nationalPhoneNumber",
      "places.internationalPhoneNumber",
      "places.websiteUri",
      "places.rating",
      "places.userRatingCount",
      "places.location",
    ].join(",");

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);

      const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify({
          textQuery,
          languageCode: "pt-BR",
          regionCode: "BR",
          pageSize: Math.min(data.maxResultados, 20),
        }),
      }).finally(() => clearTimeout(t));

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Google Places ${res.status}: ${body.slice(0, 400)}`);
        if (res.status === 401 || res.status === 403) {
          return { leads: [] as LeadOut[], error: "Acesso negado pela Google. Reconecte o Google Maps." };
        }
        if (res.status === 429) {
          return { leads: [] as LeadOut[], error: "Limite de buscas do Google atingido. Aguarde alguns minutos." };
        }
        return { leads: [] as LeadOut[], error: `Google retornou ${res.status}. Tente novamente.` };
      }

      const payload = (await res.json()) as { places?: GooglePlace[] };
      const places = payload.places ?? [];

      const leads: LeadOut[] = places.map((p, i): LeadOut => {
        const site = normalizeWebsite(p.websiteUri);
        const telefone = normalizePhone(p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? "");
        return {
          id: p.id ?? `gp-${Date.now()}-${i}`,
          nome: (p.displayName?.text ?? "Sem nome").slice(0, 120).trim(),
          nicho: data.nicho,
          cidade: data.cidade,
          endereco: p.formattedAddress ?? "",
          telefone,
          site,
          avaliacao: typeof p.rating === "number" ? Math.min(5, p.rating) : 0,
          totalAvaliacoes: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
          lat: p.location?.latitude ?? 0,
          lng: p.location?.longitude ?? 0,
        };
      }).filter((l) => l.nome && l.nome !== "Sem nome");

      let out = leads;
      let aviso: string | null = null;

      if (data.semSite) {
        const filtrado = out.filter((l) => !l.site);
        if (filtrado.length === 0 && out.length > 0) {
          aviso = "Nenhum negócio sem site nesta busca — mostrando todos os resultados.";
        } else {
          out = filtrado;
        }
      }

      if (data.avaliacaoMin > 0) {
        const filtrado = out.filter((l) => l.avaliacao === 0 || l.avaliacao >= data.avaliacaoMin);
        if (filtrado.length === 0 && out.length > 0) {
          aviso = "Nenhum negócio com avaliação suficiente — mostrando todos os resultados.";
        } else {
          out = filtrado;
        }
      }

      out = out.slice(0, data.maxResultados);

      return { leads: out, error: aviso };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAbort = msg.includes("aborted") || msg.includes("AbortError");
      console.error("buscarLeadsReais error:", msg);
      return {
        leads: [] as LeadOut[],
        error: isAbort
          ? "Tempo esgotado consultando o Google. Tente um nicho mais específico."
          : "Erro ao consultar o Google. Tente novamente em alguns segundos.",
      };
    }
  });
