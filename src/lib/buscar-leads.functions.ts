import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca leads reais via Google Places API (New), através do gateway
 * de conectores do Lovable. Mantém o shape do tipo MockLead.
 */

const InputSchema = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  raio: z.number().min(1).max(50).optional().default(15), // km (máx 50 do Places)
  semSite: z.boolean().optional().default(false),
  avaliacaoMin: z.number().min(0).max(5).optional().default(0),
  maxResultados: z.number().min(1).max(20).optional().default(20),
});

const FILTRAR_PUBLICOS = [
  "ubs", "unidade básica", "unidade basica", "sus", "cras", "creas",
  "prefeitura", "secretaria", "governo", "municipal", "estadual",
  "federal", "escola pública", "escola publica", "hospital escola",
  "hospital universitário", "hospital universitario", "faculdade",
  "universidade", "ifrs", "ufpel", "ucpel", "posto de saúde",
  "posto de saude", "caps", "nasf", "upa", "pronto socorro",
];

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

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    rating?: number;
    userRatingCount?: number;
    location?: { latitude?: number; longitude?: number };
  }>;
};

type GeocodeResponse = {
  status?: string;
  results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
};

export const buscarLeadsReais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      console.error("Missing Google Maps connector credentials");
      return {
        leads: [] as LeadOut[],
        error: "Conector do Google Maps não configurado. Tente novamente em instantes.",
      };
    }

    const authHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
    };

    try {
      // Passo 1: Geocodifica a cidade (usado como locationBias).
      const geoUrl = `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(
        data.cidade + ", Brasil",
      )}&language=pt-BR&region=br`;
      const geoCtrl = new AbortController();
      const geoTimer = setTimeout(() => geoCtrl.abort(), 10000);
      const geoRes = await fetch(geoUrl, { headers: authHeaders, signal: geoCtrl.signal })
        .finally(() => clearTimeout(geoTimer));

      if (!geoRes.ok) {
        const body = await geoRes.text().catch(() => "");
        console.error(`Geocoding ${geoRes.status}: ${body.slice(0, 200)}`);
        return { leads: [] as LeadOut[], error: "Erro ao localizar a cidade. Tente novamente." };
      }
      const geoData = (await geoRes.json()) as GeocodeResponse;
      const loc = geoData.results?.[0]?.geometry?.location;
      if (!loc) {
        return {
          leads: [] as LeadOut[],
          error: 'Cidade não encontrada. Tente ser mais específico (ex: "São Paulo, SP").',
        };
      }

      // Passo 2: Places API (New) — searchText com locationBias circular.
      const radiusMeters = Math.min(Math.round(data.raio * 1000), 50000);
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

      const searchCtrl = new AbortController();
      const searchTimer = setTimeout(() => searchCtrl.abort(), 20000);
      const searchRes = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify({
          textQuery: `${data.nicho} em ${data.cidade}`,
          languageCode: "pt-BR",
          regionCode: "BR",
          maxResultCount: Math.min(data.maxResultados, 20),
          locationBias: {
            circle: {
              center: { latitude: loc.lat, longitude: loc.lng },
              radius: radiusMeters,
            },
          },
        }),
        signal: searchCtrl.signal,
      }).finally(() => clearTimeout(searchTimer));

      if (!searchRes.ok) {
        const body = await searchRes.text().catch(() => "");
        console.error(`Places ${searchRes.status}: ${body.slice(0, 300)}`);
        if (searchRes.status === 429) {
          return {
            leads: [] as LeadOut[],
            error: "Muitas buscas em sequência. Aguarde alguns segundos e tente novamente.",
          };
        }
        return {
          leads: [] as LeadOut[],
          error: "Erro ao consultar o Google Maps. Tente novamente em instantes.",
        };
      }

      const payload = (await searchRes.json()) as PlacesSearchResponse;
      const places = payload.places ?? [];

      let out: LeadOut[] = places
        .filter((p) => p.displayName?.text)
        .map((p, i): LeadOut => {
          const phone = p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? "";
          return {
            id: `gmap-${p.id ?? i}`,
            nome: (p.displayName?.text ?? "Sem nome").slice(0, 120),
            nicho: data.nicho,
            cidade: data.cidade,
            endereco: p.formattedAddress ?? data.cidade,
            telefone: normalizePhone(phone),
            site: normalizeWebsite(p.websiteUri ?? null),
            avaliacao: p.rating ?? 0,
            totalAvaliacoes: p.userRatingCount ?? 0,
            lat: p.location?.latitude ?? 0,
            lng: p.location?.longitude ?? 0,
          };
        });

      let aviso: string | null = null;

      // Remove estabelecimentos públicos / institucionais.
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

      // Deduplica.
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
      console.error("buscarLeadsReais (Google Places) error:", msg);
      return {
        leads: [] as LeadOut[],
        error: isAbort
          ? "Tempo esgotado consultando o Google Maps. Tente um nicho mais específico ou um raio menor."
          : "Erro ao buscar leads. Tente novamente em alguns segundos.",
      };
    }
  });
