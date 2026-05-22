import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Busca leads reais no Google Maps usando Firecrawl.
 * Mantém o mesmo shape do tipo MockLead para compatibilidade com o resto do app.
 */

const InputSchema = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  semSite: z.boolean().optional().default(false),
  avaliacaoMin: z.number().min(0).max(5).optional().default(0),
  maxResultados: z.number().min(1).max(100).optional().default(50),
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

const FirecrawlJsonSchema = {
  type: "object",
  properties: {
    businesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          phone: { type: "string" },
          website: { type: "string" },
          rating: { type: "number" },
          reviewsCount: { type: "number" },
          category: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["businesses"],
};

function normalizePhone(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

function normalizeWebsite(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (/google\.com|maps\.google|business\.google/i.test(s)) return null;
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export const buscarLeadsReais = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { leads: [] as LeadOut[], error: "Firecrawl não configurado" };
    }

    const query = `${data.nicho} ${data.cidade}`;
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: mapsUrl,
          formats: [
            {
              type: "json",
              schema: FirecrawlJsonSchema,
              prompt: `Extraia até ${data.maxResultados} negócios listados nesta página de resultados do Google Maps. Para cada um, retorne: name (nome completo), address (endereço completo), phone (telefone se visível), website (URL oficial se houver, ignore links do google), rating (nota de 0 a 5), reviewsCount (número total de avaliações), category (categoria/nicho). Não invente dados — se um campo não estiver visível, omita.`,
            },
          ],
          onlyMainContent: false,
          waitFor: 3000,
          location: { country: "BR", languages: ["pt-BR"] },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Firecrawl ${res.status}: ${body.slice(0, 300)}`);
        return { leads: [] as LeadOut[], error: `Falha ao buscar (${res.status})` };
      }

      const payload = await res.json();
      const json = payload?.data?.json ?? payload?.json ?? {};
      const businesses: any[] = Array.isArray(json?.businesses) ? json.businesses : [];

      let leads: LeadOut[] = businesses
        .filter((b) => b && typeof b.name === "string" && b.name.trim().length > 0)
        .map((b, i): LeadOut => ({
          id: `fc-${Date.now()}-${i}`,
          nome: String(b.name).trim(),
          nicho: typeof b.category === "string" && b.category ? b.category : data.nicho,
          cidade: data.cidade,
          endereco: typeof b.address === "string" ? b.address : "",
          telefone: normalizePhone(b.phone),
          site: normalizeWebsite(b.website),
          avaliacao: typeof b.rating === "number" ? b.rating : 0,
          totalAvaliacoes: typeof b.reviewsCount === "number" ? b.reviewsCount : 0,
          lat: 0,
          lng: 0,
        }));

      if (data.semSite) leads = leads.filter((l) => !l.site);
      if (data.avaliacaoMin > 0) leads = leads.filter((l) => l.avaliacao >= data.avaliacaoMin);
      leads = leads.slice(0, data.maxResultados);

      return { leads, error: null as string | null };
    } catch (err) {
      console.error("buscarLeadsReais error:", err);
      return { leads: [] as LeadOut[], error: "Erro ao consultar Firecrawl" };
    }
  });
