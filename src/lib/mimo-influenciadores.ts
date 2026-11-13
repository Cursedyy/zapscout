import { z } from "zod";

export const CAMPANHA_INFLUENCIADORES = "lancamento-2026-11";
export const NICHOS_INFLUENCIADORES = [
  "Maternidade e família",
  "Alimentação e receitas",
  "Lifestyle e rotina",
  "Outros",
] as const;
export const PARCERIAS_INFLUENCIADORES = [
  "Recebimento de produtos (permuta)",
  "Parceria remunerada",
  "Ambas as opções",
] as const;
export const VIEWS_INFLUENCIADORES = [
  "Até 1 mil",
  "Mais de 1 mil até 5 mil",
  "Mais de 5 mil até 20 mil",
  "Mais de 20 mil",
] as const;
export const ETAPAS_INFLUENCIADORES = [
  "Novo",
  "Em análise",
  "Pré-selecionado",
  "Contatado",
  "Aprovado",
  "Confirmado",
  "Não selecionado",
  "Desistiu",
] as const;
export const UFS =
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
export const ESTADOS_EUA = [
  { uf: "US-AL", nome: "Alabama" },
  { uf: "US-AK", nome: "Alaska" },
  { uf: "US-AZ", nome: "Arizona" },
  { uf: "US-AR", nome: "Arkansas" },
  { uf: "US-CA", nome: "California" },
  { uf: "US-CO", nome: "Colorado" },
  { uf: "US-CT", nome: "Connecticut" },
  { uf: "US-DE", nome: "Delaware" },
  { uf: "US-FL", nome: "Florida" },
  { uf: "US-GA", nome: "Georgia" },
  { uf: "US-HI", nome: "Hawaii" },
  { uf: "US-ID", nome: "Idaho" },
  { uf: "US-IL", nome: "Illinois" },
  { uf: "US-IN", nome: "Indiana" },
  { uf: "US-IA", nome: "Iowa" },
  { uf: "US-KS", nome: "Kansas" },
  { uf: "US-KY", nome: "Kentucky" },
  { uf: "US-LA", nome: "Louisiana" },
  { uf: "US-ME", nome: "Maine" },
  { uf: "US-MD", nome: "Maryland" },
  { uf: "US-MA", nome: "Massachusetts" },
  { uf: "US-MI", nome: "Michigan" },
  { uf: "US-MN", nome: "Minnesota" },
  { uf: "US-MS", nome: "Mississippi" },
  { uf: "US-MO", nome: "Missouri" },
  { uf: "US-MT", nome: "Montana" },
  { uf: "US-NE", nome: "Nebraska" },
  { uf: "US-NV", nome: "Nevada" },
  { uf: "US-NH", nome: "New Hampshire" },
  { uf: "US-NJ", nome: "New Jersey" },
  { uf: "US-NM", nome: "New Mexico" },
  { uf: "US-NY", nome: "New York" },
  { uf: "US-NC", nome: "North Carolina" },
  { uf: "US-ND", nome: "North Dakota" },
  { uf: "US-OH", nome: "Ohio" },
  { uf: "US-OK", nome: "Oklahoma" },
  { uf: "US-OR", nome: "Oregon" },
  { uf: "US-PA", nome: "Pennsylvania" },
  { uf: "US-RI", nome: "Rhode Island" },
  { uf: "US-SC", nome: "South Carolina" },
  { uf: "US-SD", nome: "South Dakota" },
  { uf: "US-TN", nome: "Tennessee" },
  { uf: "US-TX", nome: "Texas" },
  { uf: "US-UT", nome: "Utah" },
  { uf: "US-VT", nome: "Vermont" },
  { uf: "US-VA", nome: "Virginia" },
  { uf: "US-WA", nome: "Washington" },
  { uf: "US-WV", nome: "West Virginia" },
  { uf: "US-WI", nome: "Wisconsin" },
  { uf: "US-WY", nome: "Wyoming" },
  { uf: "US-DC", nome: "Washington, D.C." },
] as const;
export const UFS_INFLUENCIADORES = [...UFS, ...ESTADOS_EUA.map((estado) => estado.uf)];
export const podeGerenciarInfluenciadores = (papel: string) =>
  ["administrador", "gestor", "marketing"].includes(papel);
export function normalizarPerfil(valor: string) {
  return valor
    .trim()
    .replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\/@?/i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}
export function normalizarWhatsappInfluenciador(valor: string) {
  let numero = valor.replace(/\D/g, "");
  if (/^0055\d{10,11}$/.test(numero)) numero = numero.slice(4);
  else if (/^55\d{10,11}$/.test(numero)) numero = numero.slice(2);
  // Brazilian mobile numbers before the ninth digit identify the same line.
  if (/^[1-9]{2}[6-9]\d{7}$/.test(numero)) numero = numero.slice(0, 2) + "9" + numero.slice(2);
  return numero;
}
export const inscricaoInfluenciadorSchema = z.object({
  nome: z.string().trim().min(3, "Informe seu nome completo.").max(150),
  whatsapp: z
    .string()
    .transform(normalizarWhatsappInfluenciador)
    .pipe(z.string().regex(/^[1-9]{2}\d{8,9}$/, "Informe o WhatsApp com DDD.")),
  rede: z.enum(["Instagram", "TikTok"]),
  perfil: z
    .string()
    .max(200)
    .transform(normalizarPerfil)
    .pipe(
      z.string().regex(/^[a-z0-9_][a-z0-9_.]{0,29}$/, "Informe um @perfil válido, sem espaços."),
    ),
  cidade: z.string().trim().min(2).max(100),
  uf: z.string().refine((v) => UFS_INFLUENCIADORES.includes(v), "Escolha seu estado."),
  seguidores: z.number().int().min(0).max(1_000_000_000),
  visualizacoes: z.enum(VIEWS_INFLUENCIADORES),
  nicho: z.enum(NICHOS_INFLUENCIADORES),
  parceria: z.enum(PARCERIAS_INFLUENCIADORES),
  consentimento: z.literal(true, {
    errorMap: () => ({ message: "É necessário aceitar o contato para participar." }),
  }),
  site: z.string().max(0).default(""),
});
export const editarInfluenciadorSchema = z.object({
  id: z.string().uuid(),
  versao: z.number().int().positive(),
  etapa: z.enum(ETAPAS_INFLUENCIADORES),
  notas: z.string().trim().max(5000),
});
export type InscricaoInfluenciador = z.infer<typeof inscricaoInfluenciadorSchema>;
export type Influenciador = Omit<InscricaoInfluenciador, "site"> & {
  id: string;
  empresa_id: string;
  campanha: string;
  etapa: (typeof ETAPAS_INFLUENCIADORES)[number];
  notas: string;
  versao: number;
  created_at: string;
  updated_at: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
};
export type HistoricoInfluenciador = {
  id: string;
  etapa: string;
  notas: string;
  created_at: string;
  acao?: string;
};
export const METAS_INFLUENCIADORES = [
  { categoria: "Nano", meta: 60 },
  { categoria: "Micro", meta: 240 },
  { categoria: "Média", meta: 100 },
] as const;
export function categoriaInfluenciador(n: number) {
  if (n < 1000) return "Abaixo de 1 mil";
  if (n < 5000) return "Nano";
  if (n < 30000) return "Micro";
  if (n <= 100000) return "Média";
  return "Acima de 100 mil";
}
export function urlPerfilInfluenciador(i: Pick<Influenciador, "rede" | "perfil">) {
  return i.rede === "Instagram"
    ? `https://www.instagram.com/${encodeURIComponent(i.perfil)}/`
    : `https://www.tiktok.com/@${encodeURIComponent(i.perfil)}`;
}
export function csvInfluenciadores(linhas: Influenciador[]) {
  const celula = (v: unknown) =>
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
        "WhatsApp",
        "Rede",
        "Perfil",
        "Cidade",
        "UF",
        "Seguidores",
        "Categoria",
        "Visualizações declaradas",
        "Conteúdo",
        "Parceria",
        "Etapa",
        "Inscrição",
      ],
      ...linhas.map((i) => [
        i.nome,
        i.whatsapp,
        i.rede,
        i.perfil,
        i.cidade,
        i.uf,
        i.seguidores,
        categoriaInfluenciador(i.seguidores),
        i.visualizacoes,
        i.nicho,
        i.parceria,
        i.etapa,
        i.created_at,
      ]),
    ]
      .map((l) => l.map(celula).join(";"))
      .join("\r\n")
  );
}
