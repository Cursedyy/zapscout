import type { MockLead } from "@/data/mock-leads";

// Perfil público; não contém carteira, preços ou dados internos da MiMo.
export const SEGMENTOS_MIMO = [
  { termo: "Loja de produtos naturais", oportunidade: "Apresentar o mix de alimentos saudáveis para revenda." },
  { termo: "Empório", oportunidade: "Avaliar a inclusão dos produtos MiMo no mix do empório." },
  { termo: "Supermercado", oportunidade: "Procurar o responsável por compras e pela seção de alimentos saudáveis." },
] as const;
export type AfinidadeMimo = { prioridade: number; nivel: "Perfil indicado" | "Avaliar perfil"; motivo: string; oportunidade: string };
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const regras = [
  { padrao: /\b(produtos? naturais?|alimentos? saudaveis|loja natural|health food|organic store)\b/, segmento: 0 },
  { padrao: /\b(emporio|emporios|mercearia|delicatessen)\b/, segmento: 1 },
  { padrao: /\b(supermercado|supermercados|supermarket|hipermercado|minimercado)\b/, segmento: 2 },
];
export function avaliarAfinidadeMimo(lead: Pick<MockLead, "nome" | "categoriaMaps">): AfinidadeMimo {
  // O termo pesquisado não comprova a atividade: nunca usar lead.nicho como evidência.
  for (const [origem, texto] of [["Categoria no Maps", lead.categoriaMaps], ["Nome do negócio", lead.nome]] as const) {
    if (!texto) continue;
    const regra = regras.find((r) => r.padrao.test(normalizar(texto)));
    if (!regra) continue;
    return { prioridade: 1, nivel: "Perfil indicado", motivo: `${origem}: ${texto}. Segmento compatível com prospecção para revenda.`, oportunidade: SEGMENTOS_MIMO[regra.segmento].oportunidade };
  }
  return { prioridade: 0, nivel: "Avaliar perfil", motivo: "Os dados retornados não identificam uma loja de produtos naturais, empório ou supermercado.", oportunidade: "Confira a atividade da empresa antes de apresentar os produtos para revenda." };
}
