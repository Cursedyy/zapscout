import { z } from "zod";
import { normalizarWhatsappInfluenciador, UFS } from "./mimo-influenciadores";
export { UFS };
export const EXPERIENCIAS_REP = {
  sem: "Primeira experiência",
  ate1: "Até 1 ano",
  "1a3": "De 1 a 3 anos",
  mais3: "Mais de 3 anos",
};
const SEGMENTOS_REP_ANTERIORES = {
  alimentos_saudaveis: "Alimentação saudável",
  suplementos: "Suplementos",
  produtos_naturais: "Produtos naturais",
  farmacias: "Farmácias",
  supermercados: "Supermercados",
  outros: "Outros",
};
export const SEGMENTOS_REP = {
  alimentar: "Alimentar",
  distribuicao: "Distribuição",
  emporios: "Empórios",
  casas_especializadas: "Casas Especializadas",
  farma: "Farma",
};
export const ROTULOS_SEGMENTOS_REP = { ...SEGMENTOS_REP_ANTERIORES, ...SEGMENTOS_REP };
export const CORE_REP = {
  ativo: "Sim, tenho registro",
  em_andamento: "Em andamento",
  nao: "Não tenho registro",
};
export const DISPONIBILIDADES_REP = {
  imediata: "Imediata",
  "15_dias": "Em até 15 dias",
  "30_dias": "Em até 30 dias",
  a_combinar: "A combinar",
};
export const ETAPAS_REP = [
  "Novo",
  "Em análise",
  "Pré-selecionado",
  "Contatado",
  "Aprovado",
  "Confirmado",
  "Não selecionado",
  "Desistiu",
] as const;
export const podeGerenciarRepresentantes = (papel: string) =>
  ["administrador", "gestor", "marketing", "vendedor"].includes(papel);
export const inscricaoRepresentanteSchema = z.object({
  nome: z.string().trim().min(3, "Informe seu nome completo.").max(150),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
  whatsapp: z
    .string()
    .transform(normalizarWhatsappInfluenciador)
    .pipe(z.string().regex(/^[1-9]{2}\d{8,9}$/, "Informe o WhatsApp com DDD.")),
  cidade: z.string().trim().min(2, "Informe sua cidade.").max(100),
  uf: z.string().refine((v) => UFS.includes(v), "Escolha seu estado."),
  regiao_atuacao: z
    .string()
    .trim()
    .min(2, "Informe as regiões ou cidades que atende com frequência e regularidade.")
    .max(500),
  experiencia: z.enum(["sem", "ate1", "1a3", "mais3"]),
  segmentos: z
    .array(
      z.enum(["alimentar", "distribuicao", "emporios", "casas_especializadas", "farma"]),
    )
    .min(1, "Escolha pelo menos um canal.")
    .max(5)
    .transform((v) => [...new Set(v)]),
  principais_clientes: z.string().trim().min(2, "Informe seus principais clientes nos canais selecionados.").max(2000),
  marcas_atuais: z.string().trim().max(1000).default(""),
  core: z.enum(["ativo", "em_andamento", "nao"]),
  motivacao: z.string().trim().min(1, "Conte por que gostaria de representar a MiMo.").max(2000),
  consentimento: z.literal(true, {
    error: "Aceite o contato sobre esta seleção para participar.",
  }),
  site: z.string().max(0).default(""),
});
export const editarRepresentanteSchema = z.object({
  id: z.string().uuid(),
  versao: z.number().int().positive(),
  etapa: z.enum(ETAPAS_REP),
  notas: z.string().trim().max(5000),
});
export type InscricaoRepresentante = z.infer<typeof inscricaoRepresentanteSchema>;
export type Representante = Omit<InscricaoRepresentante, "site" | "motivacao" | "segmentos" | "principais_clientes"> & {
  segmentos: (keyof typeof ROTULOS_SEGMENTOS_REP)[];
  principais_clientes: string | null;
  carteira_clientes: number | null;
  disponibilidade: keyof typeof DISPONIBILIDADES_REP | null;
  motivacao: string | null;
  id: string;
  empresa_id: string;
  etapa: (typeof ETAPAS_REP)[number];
  notas: string;
  versao: number;
  created_at: string;
  updated_at: string;
  excluido_em: string | null;
  excluido_por: string | null;
};
export type HistoricoRepresentante = {
  id: string;
  empresa_id: string;
  representante_id: string;
  etapa: string;
  notas: string;
  acao: string;
  created_at: string;
};
export function csvRepresentantes(rows: Representante[]) {
  const cell = (v: unknown) =>
    '"' +
    String(v ?? "")
      .replace(/^[\s]*([=+@-])/, "'$1")
      .replace(/"/g, '""') +
    '"';
  return (
    "\ufeff" +
    [
      [
        "Nome",
        "E-mail",
        "WhatsApp",
        "Cidade",
        "UF",
        "Regiões ou cidades atendidas com frequência e regularidade",
        "Experiência",
        "Canais de referência comercial",
        "Principais clientes nos canais selecionados",
        "Clientes na carteira (cadastros anteriores)",
        "Marcas representadas e tempo de representação",
        "CORE",
        "Disponibilidade (cadastros anteriores)",
        "Porque gostaria de representar a MiMo",
        "Etapa",
        "Inscrição",
      ],
      ...rows.map((r) => [
        r.nome,
        r.email,
        r.whatsapp,
        r.cidade,
        r.uf,
        r.regiao_atuacao,
        EXPERIENCIAS_REP[r.experiencia],
        r.segmentos.map((s) => ROTULOS_SEGMENTOS_REP[s] ?? s).join(", "),
        r.principais_clientes ?? "",
        r.carteira_clientes,
        r.marcas_atuais,
        CORE_REP[r.core],
        r.disponibilidade ? DISPONIBILIDADES_REP[r.disponibilidade] : "",
        r.motivacao ?? "",
        r.etapa,
        r.created_at,
      ]),
    ]
      .map((r) => r.map(cell).join(";"))
      .join("\r\n")
  );
}
