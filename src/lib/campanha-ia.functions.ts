import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chamarLovableAI } from "@/lib/ia.server";

export type EtapaConfig = {
  ordem: number;
  intervalo: number;
  unidade: "horas" | "dias";
  mensagem: string;
};

export type CampanhaConfigIA = {
  nomeCampanha: string;
  templateEscolhido: string;
  motivoTemplate: string;
  sequencia: EtapaConfig[];
  horarioIdeal: string;
  dicaCampanha: string;
};

const input = z.object({
  nicho: z.string().min(1).max(120),
  cidade: z.string().min(1).max(120),
  quantidade: z.number().int().min(1).max(500),
  objetivo: z.enum([
    "reuniao",
    "vender_site",
    "vender_automacao",
    "vender_social",
    "prospectar",
  ]),
  semSitePct: z.number().min(0).max(100).default(0),
});

const FALLBACK = (p: z.infer<typeof input>): CampanhaConfigIA => {
  const mesAno = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return {
    nomeCampanha: `${p.nicho} ${p.cidade} — ${mesAno}`,
    templateEscolhido: "Clássica 3 etapas",
    motivoTemplate: "Sequência equilibrada que funciona na maioria dos nichos.",
    sequencia: [
      { ordem: 1, intervalo: 0, unidade: "horas", mensagem: `Olá! Vi a {{nome}} no Google Maps e percebi uma oportunidade de melhorar a presença digital de vocês em ${p.cidade}. Posso explicar em 5 minutos?` },
      { ordem: 2, intervalo: 3, unidade: "dias", mensagem: `Oi {{nome}}, tudo bem? Só reforçando meu contato. Ajudo negócios em ${p.cidade} a atrair mais clientes. Tem interesse?` },
      { ordem: 3, intervalo: 7, unidade: "dias", mensagem: `{{nome}}, última mensagem da minha parte. Se quiser conversar no futuro, é só responder. Até mais! 👋` },
    ],
    horarioIdeal: "09:00",
    dicaCampanha: "Dispare entre 9h e 11h para maximizar respostas.",
  };
};

export const gerarConfigCampanhaIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { checkIaRate } = await import("./ia-rate-limit.server");
    const rl = await checkIaRate(context.userId, "gen");
    if (rl) throw rl;
    const sys = `Você é especialista em campanhas de prospecção via WhatsApp para agências digitais brasileiras. Responda SEMPRE com JSON válido (sem markdown, sem comentários).`;

    const objetivoLabel: Record<typeof data.objetivo, string> = {
      reuniao: "Agendar reunião ou ligação",
      vender_site: "Vender site ou landing page",
      vender_automacao: "Vender automação WhatsApp",
      vender_social: "Vender gestão de redes sociais",
      prospectar: "Apenas prospectar e qualificar",
    };

    const userPrompt = `Monte uma campanha de prospecção com estes parâmetros:
- Nicho: ${data.nicho}
- Cidade: ${data.cidade}
- Quantidade de leads: ${data.quantidade}
- Objetivo: ${objetivoLabel[data.objetivo]}
- % leads sem site: ${data.semSitePct.toFixed(0)}%

Retorne APENAS este JSON (chaves exatas, valores em português BR):
{
  "nomeCampanha": "<nome criativo e específico, máx 60 chars>",
  "templateEscolhido": "<nome curto do template>",
  "motivoTemplate": "<1 frase explicando por que é o melhor>",
  "sequencia": [
    { "ordem": 1, "intervalo": 0, "unidade": "horas", "mensagem": "<mensagem inicial usando {{nome}} e {{cidade}}, tom amigável, máx 280 chars>" },
    { "ordem": 2, "intervalo": 3, "unidade": "dias", "mensagem": "<follow-up 1>" },
    { "ordem": 3, "intervalo": 7, "unidade": "dias", "mensagem": "<follow-up final>" }
  ],
  "horarioIdeal": "<HH:MM, ex 09:00>",
  "dicaCampanha": "<dica prática para o nicho, máx 100 chars>"
}`;

    try {
      const raw = await chamarLovableAI(sys, [{ role: "user", content: userPrompt }]);
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned) as CampanhaConfigIA;
      if (!Array.isArray(parsed.sequencia) || parsed.sequencia.length === 0) {
        throw new Error("sequência vazia");
      }
      return parsed;
    } catch (err) {
      console.error("[campanha-ia] fallback:", err);
      return FALLBACK(data);
    }
  });
