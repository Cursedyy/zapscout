import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca leads reais via OpenStreetMap (Nominatim + Overpass API).
 * 100% gratuito, sem chave de API.
 * Mantém o shape do tipo MockLead para compatibilidade com a UI.
 */

const InputSchema = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  raio: z.number().min(1).max(100).optional().default(10), // km
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

// Mapeia palavras-chave de nicho para filtros Overpass QL
// Cada entrada é uma lista de pares [key, value] OR-combinados.
const NICHO_OSM: Array<{ match: RegExp; tags: Array<[string, string]> }> = [
  { match: /(odontolog|dentista)/i, tags: [["amenity", "dentist"]] },
  { match: /(clinic|cl[ií]nica|m[eé]dic|hospital|consult[oó]rio)/i, tags: [["amenity", "clinic"], ["amenity", "doctors"], ["amenity", "hospital"]] },
  { match: /(veterin)/i, tags: [["amenity", "veterinary"]] },
  { match: /(pet ?shop|petshop|pet )/i, tags: [["shop", "pet"]] },
  { match: /(restaurante|restaurant)/i, tags: [["amenity", "restaurant"]] },
  { match: /(lanchonete|fast.?food|hamburg|burger)/i, tags: [["amenity", "fast_food"]] },
  { match: /(pizzaria|pizza)/i, tags: [["amenity", "restaurant"], ["cuisine", "pizza"]] },
  { match: /(caf[eé]|cafeteria|coffee)/i, tags: [["amenity", "cafe"]] },
  { match: /(bar |^bar$|pub|boteco)/i, tags: [["amenity", "bar"], ["amenity", "pub"]] },
  { match: /(padaria|bakery)/i, tags: [["shop", "bakery"]] },
  { match: /(sal[aã]o|cabelo|hairdresser)/i, tags: [["shop", "hairdresser"]] },
  { match: /(barbear|barber)/i, tags: [["shop", "hairdresser"]] },
  { match: /(academia|fitness|crossfit|gym)/i, tags: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]] },
  { match: /(farm[aá]cia|drogaria|pharmacy)/i, tags: [["amenity", "pharmacy"]] },
  { match: /(supermercad|mercad)/i, tags: [["shop", "supermarket"], ["shop", "convenience"]] },
  { match: /(advogad|lawyer|advocacia)/i, tags: [["office", "lawyer"]] },
  { match: /(contab|accountant)/i, tags: [["office", "accountant"]] },
  { match: /(imobili[aá]ri|corretor|real.?estate)/i, tags: [["office", "estate_agent"]] },
  { match: /(hotel|pousada)/i, tags: [["tourism", "hotel"], ["tourism", "guest_house"]] },
  { match: /(oficina|mec[aâ]nica|auto.?center|funilaria)/i, tags: [["shop", "car_repair"]] },
  { match: /(fot[oó]graf|photo)/i, tags: [["shop", "photo"], ["craft", "photographer"]] },
  { match: /(escola|colegio|col[eé]gio)/i, tags: [["amenity", "school"]] },
  { match: /(creche|berç[aá]rio)/i, tags: [["amenity", "kindergarten"], ["amenity", "childcare"]] },
  { match: /(psic[oó]log|terapeut)/i, tags: [["healthcare", "psychotherapist"], ["office", "therapist"]] },
  { match: /(fisioterap)/i, tags: [["healthcare", "physiotherapist"]] },
  { match: /([oó]tica|optic)/i, tags: [["shop", "optician"]] },
  { match: /(roupa|moda|boutique|clothing)/i, tags: [["shop", "clothes"]] },
  { match: /(joalh|jewel)/i, tags: [["shop", "jewelry"]] },
  { match: /(floricultura|flores|florist)/i, tags: [["shop", "florist"]] },
  { match: /(pet[ií]score|pintura)/i, tags: [["shop", "paint"]] },
  { match: /(material de constru|construç|hardware)/i, tags: [["shop", "hardware"], ["shop", "doityourself"]] },
  { match: /(igreja|church)/i, tags: [["amenity", "place_of_worship"]] },
  { match: /(banco|bank)/i, tags: [["amenity", "bank"]] },
  { match: /(posto|gasolina|fuel)/i, tags: [["amenity", "fuel"]] },
];

function buildOverpassFilters(nicho: string): string[] {
  const found = NICHO_OSM.find((n) => n.match.test(nicho));
  if (found) {
    return found.tags.map(([k, v]) => `[${JSON.stringify(k)}=${JSON.stringify(v)}]`);
  }
  // Fallback: busca pelo nome
  const safe = nicho.replace(/["\\]/g, "");
  return [`["name"~${JSON.stringify(safe)},i]`];
}

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

function formatarEndereco(tags: Record<string, string>, cidade: string): string {
  const partes: string[] = [];
  if (tags["addr:street"]) {
    let rua = tags["addr:street"];
    if (tags["addr:housenumber"]) rua += `, ${tags["addr:housenumber"]}`;
    partes.push(rua);
  }
  if (tags["addr:suburb"] || tags["addr:neighbourhood"]) {
    partes.push(tags["addr:suburb"] || tags["addr:neighbourhood"]);
  }
  if (partes.length === 0) return cidade;
  return partes.join(" - ");
}

type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function fetchOverpass(query: string): Promise<Response> {
  let lastRes: Response | null = null;
  let lastErr: unknown = null;
  for (const servidor of OVERPASS_SERVERS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(servidor, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (res.ok) return res;
      lastRes = res;
      console.warn(`Overpass ${servidor} retornou ${res.status}`);
    } catch (err) {
      lastErr = err;
      console.warn(
        `Overpass ${servidor} falhou:`,
        err instanceof Error ? err.message : String(err),
      );
      continue;
    }
  }
  if (lastRes) return lastRes;
  throw lastErr ?? new Error("Todos os servidores Overpass indisponíveis.");
}


export const buscarLeadsReais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const userAgent = "ZapScout/1.0 (https://zapscout.com.br)";

    try {
      // Passo 1: Geocodificar a cidade
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        data.cidade + ", Brasil",
      )}&format=json&limit=1&countrycodes=br`;

      const geoCtrl = new AbortController();
      const geoTimer = setTimeout(() => geoCtrl.abort(), 10000);
      const geoRes = await fetch(geocodeUrl, {
        headers: { "User-Agent": userAgent, "Accept-Language": "pt-BR" },
        signal: geoCtrl.signal,
      }).finally(() => clearTimeout(geoTimer));

      if (!geoRes.ok) {
        console.error("Nominatim error", geoRes.status);
        return { leads: [] as LeadOut[], error: "Erro ao localizar a cidade. Tente novamente." };
      }
      const geoData = (await geoRes.json()) as Array<{ lat: string; lon: string }>;
      if (!geoData.length) {
        return {
          leads: [] as LeadOut[],
          error: 'Cidade não encontrada. Tente ser mais específico (ex: "São Paulo, SP").',
        };
      }
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);

      // Passo 2: Construir query Overpass
      const filters = buildOverpassFilters(data.nicho);
      const raioMetros = Math.round(data.raio * 1000);
      const around = `(around:${raioMetros},${lat},${lon})`;

      const blocks = filters
        .map(
          (f) =>
            `  node${f}${around};\n  way${f}${around};\n  relation${f}${around};`,
        )
        .join("\n");

      const overpassQuery = `[out:json][timeout:25];\n(\n${blocks}\n);\nout center tags;`;

      // Passo 3: Buscar negócios (com fallback de servidores)
      const overpassRes = await fetchOverpass(overpassQuery);


      if (!overpassRes.ok) {
        const body = await overpassRes.text().catch(() => "");
        console.error(`Overpass ${overpassRes.status}: ${body.slice(0, 300)}`);
        if (overpassRes.status === 429) {
          return {
            leads: [] as LeadOut[],
            error: "Muitas buscas em sequência. Aguarde alguns segundos e tente novamente.",
          };
        }
        return {
          leads: [] as LeadOut[],
          error: "Erro ao consultar OpenStreetMap. Tente novamente em instantes.",
        };
      }

      const payload = (await overpassRes.json()) as { elements?: OverpassElement[] };
      const elementos = payload.elements ?? [];

      const leads: LeadOut[] = elementos
        .filter((el) => el.tags && el.tags.name)
        .map((el, i): LeadOut => {
          const tags = el.tags ?? {};
          const elat = el.lat ?? el.center?.lat ?? 0;
          const elon = el.lon ?? el.center?.lon ?? 0;
          const phone = tags["phone"] ?? tags["contact:phone"] ?? "";
          const website = tags["website"] ?? tags["contact:website"] ?? null;
          return {
            id: `osm-${el.type}-${el.id ?? i}`,
            nome: (tags.name ?? "Sem nome").slice(0, 120),
            nicho: data.nicho,
            cidade: data.cidade,
            endereco: formatarEndereco(tags, data.cidade),
            telefone: normalizePhone(phone),
            site: normalizeWebsite(website),
            avaliacao: 0,
            totalAvaliacoes: 0,
            lat: elat,
            lng: elon,
          };
        });

      // Filtros
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

      // Deduplica por nome+endereço
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
      console.error("buscarLeadsReais (OSM) error:", msg);
      return {
        leads: [] as LeadOut[],
        error: isAbort
          ? "Tempo esgotado consultando o mapa. Tente um nicho mais específico ou um raio menor."
          : "Erro ao buscar leads. Tente novamente em alguns segundos.",
      };
    }
  });
