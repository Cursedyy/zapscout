export const MIMO_SLUG = "mimo";
export const PAPEIS_MIMO = ["administrador", "gestor", "vendedor"] as const;
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
};