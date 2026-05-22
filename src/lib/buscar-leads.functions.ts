import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Busca leads reais usando Firecrawl Search (mais confiável que scrapear Google Maps direto).
 * Mantém o mesmo shape do tipo MockLead para compatibilidade.
 */

const InputSchema = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  semSite: z.boolean().optional().default(false),
  avaliacaoMin: z.number().min(0).max(5).optional().default(0),
  maxResultados: z.number().min(1).max(100).optional().default(30),
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

function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55"))
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits ? String(raw) : "";
}

function normalizeWebsite(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/google\.com|maps\.google|business\.google|facebook\.com|instagram\.com|linkedin\.com/i.test(s))
    return null;
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0];
}

// Extrai telefone BR de um texto livre (markdown de uma página).
function extractPhone(text: string): string {
  const m = text.match(/(?:\+?55\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/);
  return m ? normalizePhone(m[0]) : "";
}

// Extrai endereço heurístico (linha contendo CEP, "Rua/Av/Av." e cidade).
function extractAddress(text: string, cidade: string): string {
  const linhas = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const cidadeBase = cidade.split("-")[0].trim().toLowerCase();
  for (const l of linhas) {
    if (l.length > 15 && l.length < 220 && /(rua|av\.?|avenida|alameda|travessa|rodovia|praça)/i.test(l) && l.toLowerCase().includes(cidadeBase)) {
      return l.replace(/\s+/g, " ").replace(/[*_`#]/g, "");
    }
  }
  return "";
}

export const buscarLeadsReais = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return { leads: [] as LeadOut[], error: "Firecrawl não configurado" };
    }

    const query = `${data.nicho} em ${data.cidade}`;

    try {
      // /v2/search puro (sem scrapeOptions) é ~5-10x mais rápido — não rasteia
      // cada URL individualmente. Title + description já bastam para identificar
      // o negócio; telefone/endereço são extraídos do snippet quando aparecem.
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);

      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          query,
          limit: Math.min(data.maxResultados, 20),
          lang: "pt",
          country: "br",
        }),
      }).finally(() => clearTimeout(t));

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`Firecrawl search ${res.status}: ${body.slice(0, 400)}`);
        if (res.status === 402) {
          return { leads: [] as LeadOut[], error: "Créditos do Firecrawl esgotados. Recarregue para continuar buscando." };
        }
        if (res.status === 401 || res.status === 403) {
          return { leads: [] as LeadOut[], error: "Chave Firecrawl inválida. Reconecte o conector." };
        }
        return { leads: [] as LeadOut[], error: `Firecrawl retornou ${res.status}. Tente novamente.` };
      }

      const payload = (await res.json()) as {
        data?: { web?: Array<{ url?: string; title?: string; description?: string; markdown?: string }> };
        web?: Array<{ url?: string; title?: string; description?: string; markdown?: string }>;
      };
      const web = payload?.data?.web ?? payload?.web ?? [];

      const leads: LeadOut[] = web
        .filter((r) => r && (r.title || r.url))
        .map((r, i): LeadOut => {
          const md = r.markdown ?? "";
          const desc = r.description ?? "";
          const text = `${md}\n${desc}`;
          const tel = extractPhone(text);
          const endereco = extractAddress(text, data.cidade);
          const site = normalizeWebsite(r.url);
          // Heurística de avaliação a partir do markdown: padrões "4,8 (123)" ou "★ 4.8"
          const ratingM = text.match(/(?:★|⭐|nota[:\s]*)\s*(\d[.,]?\d?)/i) ?? text.match(/\b(\d[.,]?\d)\s*\(\s*(\d+)/);
          const reviewsM = text.match(/\((\d{1,5})\s*(?:avalia|review|coment)/i);
          return {
            id: `fc-${Date.now()}-${i}`,
            nome: (r.title ?? site ?? "Sem nome").replace(/\s+[-|·•].*$/, "").slice(0, 120).trim(),
            nicho: data.nicho,
            cidade: data.cidade,
            endereco,
            telefone: tel,
            site,
            avaliacao: ratingM ? Math.min(5, parseFloat(ratingM[1].replace(",", "."))) : 0,
            totalAvaliacoes: reviewsM ? parseInt(reviewsM[1], 10) : 0,
            lat: 0,
            lng: 0,
          };
        })
        .filter((l) => l.nome && l.nome !== "Sem nome");

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
        // Mantém leads com avaliação desconhecida (0) — não é o mesmo que "abaixo do mínimo".
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
          ? "Tempo esgotado consultando o Firecrawl. Tente um nicho mais específico."
          : "Erro ao consultar Firecrawl. Tente novamente em alguns segundos.",
      };
    }
  });
