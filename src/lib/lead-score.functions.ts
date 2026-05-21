import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AnaliseIA } from "./lead-score";

const InputSchema = z.object({
  nome: z.string().min(1).max(200),
  nicho: z.string().max(120).optional().default(""),
  cidade: z.string().max(120).optional().default(""),
  avaliacao: z.number().min(0).max(5),
  totalAvaliacoes: z.number().int().min(0),
  temSite: z.boolean(),
  scoreObjetivo: z.number().int().min(0).max(100),
});

const FALLBACK: AnaliseIA = {
  ajusteScore: 0,
  nivelOportunidade: "MORNO",
  resumo: "Análise indisponível no momento.",
  pontoFraco: "Presença digital fraca",
  abordagemSugerida: "Destacar ausência de site",
  nichoAquecido: false,
  urgencia: "MEDIA",
};

export const enriquecerScoreIA = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AnaliseIA> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return FALLBACK;

    const prompt = `Você é um especialista em vendas B2B para agências digitais brasileiras.
Analise este lead e retorne APENAS um JSON (sem markdown, sem texto extra):

DADOS DO LEAD:
- Nome: ${data.nome}
- Nicho: ${data.nicho || "(não informado)"}
- Cidade: ${data.cidade || "(não informado)"}
- Avaliação Google: ${data.avaliacao} estrelas (${data.totalAvaliacoes} avaliações)
- Tem site: ${data.temSite ? "Sim" : "Não"}
- Score objetivo: ${data.scoreObjetivo}/100

RETORNE este JSON:
{
  "ajusteScore": <número entre -15 e +15>,
  "nivelOportunidade": "QUENTE" | "MORNO" | "FRIO",
  "resumo": "<máx 80 caracteres>",
  "pontoFraco": "<máx 60 caracteres>",
  "abordagemSugerida": "<máx 80 caracteres>",
  "nichoAquecido": <true|false>,
  "urgencia": "ALTA" | "MEDIA" | "BAIXA"
}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você responde APENAS com JSON válido, sem markdown." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) return FALLBACK;
      const json = await res.json();
      const txt = (json.choices?.[0]?.message?.content ?? "").trim();
      const clean = txt.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(clean);
      return {
        ajusteScore: Math.max(-15, Math.min(15, Number(parsed.ajusteScore) || 0)),
        nivelOportunidade: ["QUENTE", "MORNO", "FRIO"].includes(parsed.nivelOportunidade)
          ? parsed.nivelOportunidade
          : "MORNO",
        resumo: String(parsed.resumo ?? FALLBACK.resumo).slice(0, 120),
        pontoFraco: String(parsed.pontoFraco ?? FALLBACK.pontoFraco).slice(0, 100),
        abordagemSugerida: String(parsed.abordagemSugerida ?? FALLBACK.abordagemSugerida).slice(0, 120),
        nichoAquecido: !!parsed.nichoAquecido,
        urgencia: ["ALTA", "MEDIA", "BAIXA"].includes(parsed.urgencia) ? parsed.urgencia : "MEDIA",
      };
    } catch (err) {
      console.error("enriquecerScoreIA error:", err);
      return FALLBACK;
    }
  });
