export const MIMO_SLUG = "mimo";
export const PAPEIS_MIMO = ["administrador", "gestor", "vendedor", "marketing", "administrativo"] as const;
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
  administrativo: "Administrativo",
};

// Páginas do painel por cargo. O servidor e o banco repetem cada regra; isto só organiza o menu.
export const PAGINAS_POR_PAPEL: Record<PapelMimo, readonly string[]> = {
  administrador: ["/mimo", "/mimo/agente", "/mimo/arvore-comercial", "/mimo/automacoes", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios", "/mimo/perdas", "/mimo/equipe", "/mimo/whatsapp"],
  gestor: ["/mimo", "/mimo/agente", "/mimo/arvore-comercial", "/mimo/automacoes", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios", "/mimo/perdas", "/mimo/equipe"],
  vendedor: ["/mimo", "/mimo/agente", "/mimo/leads", "/mimo/carteira", "/mimo/tira-pedido", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios", "/mimo/perdas"],
  marketing: ["/mimo", "/mimo/campanhas", "/mimo/meta-ads", "/mimo/relatorios"],
  administrativo: ["/mimo/tira-pedido"],
};
for (const papel of ["administrador", "gestor", "marketing"] as const) {
  PAGINAS_POR_PAPEL[papel] = [...PAGINAS_POR_PAPEL[papel], "/mimo/influenciadores"];
}
export const podeAbrirPagina = (papel: PapelMimo, caminho: string) => PAGINAS_POR_PAPEL[papel].includes(caminho);
/** Dashboard e relatórios gerais (marketing recebe sem nomes de clientes). */
export const vePainelGeral = (papel: string) => ["administrador", "gestor", "marketing"].includes(papel);
export const podeImportarMeta = (papel: string) => ["administrador", "gestor", "marketing"].includes(papel);
