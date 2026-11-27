export const MIMO_SLUG = "mimo";
export const PAPEIS_MIMO = ["administrador", "gestor", "vendedor", "marketing", "lider_marketing", "administrativo"] as const;
/** Marketing e Líder de marketing têm exatamente o mesmo escopo, restrito ao módulo de marketing. */
export const ehMarketing = (papel: string) => papel === "marketing" || papel === "lider_marketing";
export type PapelMimo = (typeof PAPEIS_MIMO)[number];

export type AcessoMimo =
  | { autorizado: true; empresa: string; nome: string; papel: PapelMimo }
  | { autorizado: false };

type Empresa = { id: string; nome: string; ativa: boolean } | null;
type Membro = { papel: string; ativo: boolean } | null;

export function resolverAcessoMimo(empresa: Empresa, membro: Membro, nome: string): AcessoMimo {
  if (!empresa?.ativa || !membro?.ativo || !PAPEIS_MIMO.includes(membro.papel as PapelMimo)) {
    return { autorizado: false };
  }
  return { autorizado: true, empresa: empresa.nome, nome, papel: membro.papel as PapelMimo };
}

export const ROTULO_PAPEL: Record<PapelMimo, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  vendedor: "Vendedor",
  marketing: "Marketing",
  lider_marketing: "Líder de marketing",
  administrativo: "Administrativo",
};

// Páginas do painel por cargo. O servidor e o banco repetem cada regra; isto só organiza o menu.
export const PAGINAS_POR_PAPEL: Record<PapelMimo, readonly string[]> = {
  administrador: ["/mimo", "/mimo/agente", "/mimo/arvore-comercial", "/mimo/automacoes", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios", "/mimo/perdas", "/mimo/equipe", "/mimo/whatsapp"],
  gestor: ["/mimo", "/mimo/agente", "/mimo/arvore-comercial", "/mimo/automacoes", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios", "/mimo/perdas", "/mimo/equipe"],
  vendedor: ["/mimo", "/mimo/representantes", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios", "/mimo/perdas", "/mimo/whatsapp"],
  marketing: ["/mimo", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios"],
  lider_marketing: ["/mimo", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios"],
  administrativo: ["/mimo", "/mimo/tira-pedido"],
};
for (const papel of ["administrador", "gestor", "marketing", "lider_marketing"] as const) {
  PAGINAS_POR_PAPEL[papel] = [...PAGINAS_POR_PAPEL[papel], "/mimo/influenciadores", "/mimo/representantes", "/mimo/campanha-desenhos", "/mimo/catalogo"];
}
for (const papel of PAPEIS_MIMO) {
  PAGINAS_POR_PAPEL[papel] = [...PAGINAS_POR_PAPEL[papel], "/mimo/feedbacks"];
}
for (const papel of ["administrador", "gestor"] as const) {
  PAGINAS_POR_PAPEL[papel] = [...PAGINAS_POR_PAPEL[papel], "/mimo/omie", "/mimo/inadimplencia", "/mimo/produtos"];
}
// Representantes comerciais externos: comissão e faturamento só para a gestão.
for (const papel of ["administrador", "gestor"] as const) {
  PAGINAS_POR_PAPEL[papel] = [...PAGINAS_POR_PAPEL[papel], "/mimo/representantes-comerciais"];
}
for (const papel of ["administrador", "gestor", "vendedor", "administrativo"] as const) {
  PAGINAS_POR_PAPEL[papel] = [...PAGINAS_POR_PAPEL[papel], "/mimo/pedidos", "/mimo/rastreamento"];
}
export const podeAbrirPagina = (papel: PapelMimo, caminho: string) => PAGINAS_POR_PAPEL[papel].includes(caminho);
/** Dashboard e relatórios gerais (marketing recebe sem nomes de clientes). */
export const vePainelGeral = (papel: string) => ["administrador", "gestor"].includes(papel) || ehMarketing(papel);
export const podeImportarMeta = (papel: string) => ["administrador", "gestor"].includes(papel) || ehMarketing(papel);
